## 1. Tóm tắt điều hành

Quá trình quét cho thấy project đã có một tích hợp Gemini cơ bản, nhưng vẫn chưa có các lớp bảo vệ cần thiết cho lưu lượng AI ở mức production. Stack hiện tại có:
- một wrapper timeout,
- một vòng lặp retry đơn giản,
- một circuit breaker cơ bản,
- một số logging,

nhưng vẫn thiếu các bảo vệ quan trọng nhất cho lưu lượng burst và các request được kích hoạt lặp lại bởi người dùng:
- cache cho request,
- deduplication cho request,
- hàng đợi request,
- kiểm soát độ đồng thời,
- retry nhận biết rate-limit,
- tối ưu prompt/token,
- observability và metrics.

Dựa trên codebase, các nguyên nhân có khả năng gây timeout/429/usage cao nhất là:
- request AI lặp lại từ UI mà không được deduplication,
- prompt quá lớn và token budget quá cao,
- nhiều request liên tiếp trong một workflow,
- dùng một key cố định mà không có rotation hoặc backoff-aware retry,
- cài đặt timeout phía frontend quá mức ngắn so với latency thực tế của Gemini.

Chưa có sửa đổi code nào.


## 3. Kiểm tra bảo vệ hiện có

| Bảo vệ | Có không? | Triển khai đúng không? | Cần cải thiện? | Thiếu hoàn toàn? |
|---|---|---|---|---|
| Timeout wrapper | Có | Phần lớn là có | Có | Không |
| Retry logic | Có | Một phần | Có | Không |
| Exponential backoff | Có | Một phần | Có | Không |
| Request cancellation | Có | Có | Có | Không |
| Cache | Không | N/A | Có | Có |
| Request deduplication | Không | N/A | Có | Có |
| Queue | Không | N/A | Có | Có |
| Concurrency limit | Không | N/A | Có | Có |
| Token optimization | Một phần | Một phần | Có | Không |
| Prompt trimming | Một phần | Một phần | Có | Không |
| Structured logging | Có | Một phần | Có | Không |
| Monitoring | Không | N/A | Có | Có |
| Metrics | Không | N/A | Có | Có |
| Fallback handling | Một phần | Một phần | Có | Không |

### Ghi chú
- Timeout wrapper tồn tại trong [services/aiWrapper.js](services/aiWrapper.js), nhưng timeout hiệu quả vẫn khá ngắn cho một số workflow và chưa thật sự phù hợp với hành vi timeout phía frontend.
- Retry có tồn tại, nhưng chưa nhận biết được 429 và không dùng `Retry-After`, jitter, hoặc phân biệt giữa lỗi client-side và lỗi transient.
- Code có log lỗi, nhưng chưa có dashboard cho latency, error rate, hoặc usage per endpoint.
- Chưa có cache hoặc request coalescing layer ở backend.

---

## 4. Phân tích nguyên nhân gốc rễ

### 1) Latency của Gemini có thể là một yếu tố đóng góp
Gemini có thể trả lời chậm hơn mong đợi với prompt lớn, output lớn và request multimodal. Service hiện tại dùng timeout 28s ở tầng backend, còn frontend dùng 30s. Đây không phải là vùng an toàn rộng cho retry và xử lý slow model. Khi một attempt timeout, một retry có thể bắt đầu và tổng thời gian thực hiện có thể vượt quá kỳ vọng của người dùng hoặc frontend.

### 2) Chiến lược retry quá đơn giản
Wrapper hiện tại retry 1 lần và dùng backoff cố định. Nó chưa:
- honor `Retry-After`,
- phân biệt 429 với transient server errors,
- dùng jitter,
- tránh retry cho lỗi client-side như prompt/validation lỗi.

Điều này làm policy retry kém hiệu quả và có thể làm tăng áp lực lên Gemini trong lúc burst traffic.

### 3) Kích thước prompt và output có khả năng làm tăng latency và chi phí
Một số function gửi prompt rất lớn hoặc yêu cầu output JSON lớn:
- exercise generation,
- speech assessment,
- writing assist,
- exercise refinement,
- content import.

Prompt thường có cả context lớn, task text dài hoặc nội dung cấu trúc đầy đủ. Prompt lớn nghĩa là token nhiều, latency cao và chi phí tăng.

### 4) Request trùng hoặc lặp lại có khả năng xảy ra
UI có thể kích hoạt cùng một workflow AI nhiều lần:
- writing-assist chạy khi page load và lại khi submit trong [src/pages/ExerciseAttemptPage.jsx](src/pages/ExerciseAttemptPage.jsx),
- các workflow teacher có thể gửi generation hoặc preview nhiều lần.

Không có deduplication layer nên backend coi đây là các request độc lập.

### 5) Request đồng thời chưa được kiểm soát
Chưa có queue, concurrency limiter hoặc throttler. Nếu nhiều user hoặc nhiều action cùng lúc kích hoạt AI request, service sẽ gọi Gemini ở full concurrency và dễ đạt tới 429.


### 7) Một số workflow làm tăng số lần gọi AI
Workflow import trong [services/exerciseImportService.js](services/exerciseImportService.js) có thể kích hoạt nhiều AI calls trong một lần import. Điều này làm tăng latency và nguy cơ đụng rate limit.

### 8) Hành vi frontend làm tăng áp lực lên backend
Frontend chưa implement request coalescing hoặc cooldown ở client. Ví dụ, một page có thể gửi request AI ngay khi mount và lại khi submit. Điều này làm tăng traffic cho cùng một intent.

---

## 5. Các tính năng độ tin cậy còn thiếu

Những mục sau hiện đang thiếu hoặc chưa đủ:
- cache cho request,
- deduplication cho request đồng thời,
- queue có concurrency control,
- throttling theo user và theo endpoint,
- retry nhận biết rate-limit với hỗ trợ `Retry-After`,
- rotation/failover key,
- trimming prompt và thiết kế compact schema,
- telemetry và metrics cho latency, error rate và token usage.

---

## 6. Đánh giá các giải pháp đề xuất

| Giải pháp | Ưu điểm | Nhược điểm | Độ phức tạp | Tác động kỳ vọng | Ưu tiên |
|---|---|---|---|---|---|
| Request timeout wrapper | Ngăn request treo, cải thiện responsiveness | Cần tune cẩn thận; quá thấp sẽ khiến retry tăng | Thấp | Trung bình | Cao |
| Retry strategy | Giúp xử lý transient failures | Quá nhiều retry làm tăng latency và có thể làm 429 tệ hơn | Thấp | Trung bình | Cao |
| Exponential backoff | Giảm áp lực khi retry sau lỗi | Cần có jitter và rate-limit awareness | Thấp | Trung bình | Cao |
| Prompt optimization | Giảm latency, chi phí và token usage | Cần redesign prompt và test | Trung bình | Cao | Cao |
| Context trimming | Giữ prompt gọn, tránh token không cần thiết | Phải bảo đảm vẫn đúng task | Trung bình | Cao | Cao |
| Chunking | Hỗ trợ tasks lớn và multimodal input | Tăng độ phức tạp orchestration | Trung bình | Trung bình | Trung bình |
| AI response cache | Giảm đáng kể số request lặp lại | Phải xử lý stale data và invalidation | Trung bình | Cao | Cao |
| Cache invalidation khi regenerate | Đảm bảo trả về output mới khi được yêu cầu | Cần quy tắc cache-key rõ ràng | Thấp | Cao | Cao |
| Request deduplication | Ngăn request trùng đang chạy | Cần shared state layer nhỏ | Trung bình | Cao | Cao |
| Queue cho AI requests | Ngăn burst traffic và tạo backpressure | Thêm latency và độ phức tạp | Trung bình | Cao | Cao |
| Concurrency limiting | Bảo vệ quota Gemini và sức khỏe backend | Có thể làm chậm một số flow | Trung bình | Cao | Cao |
| Network retry | Tăng độ bền với transient network issues | Nếu không giới hạn sẽ làm tăng load | Thấp | Trung bình | Trung bình |
| API key validation | Ngăn misconfiguration và lỗi silent | Cần setup thêm một chút | Thấp | Trung bình | Trung bình |
| Circuit breaker | Dừng các request liên tục thất bại nhanh | Nếu quá aggressive có thể chặn traffic hợp lệ | Trung bình | Trung bình | Trung bình |
| Better logging and monitoring | Giúp chẩn đoán sự cố dễ hơn | Cần setup vận hành | Trung bình | Cao | Cao |

---

## 7. Khuyến nghị thiết kế cache

### Cache nên được triển khai ở đâu
Nên đặt ở tầng backend service layer, không phải frontend. Cache nên nằm giữa controller và Gemini call trong [services/aiService.js](services/aiService.js) và được dùng bởi logic wrapper trong [services/aiWrapper.js](services/aiWrapper.js).

### Thiết kế cache key
Dùng key ổn định từ:
- loại request,
- prompt đã chuẩn hóa,
- system instruction,
- model name,
- các tham số liên quan như temperature và max output tokens.

Pattern phù hợp:
- `ai:<operation>:<hash(prompt+system+params)>`

### Chiến lược TTL
TTL đề xuất theo loại request:
- task ngắn, deterministic: 5–15 phút,
- writing assistance mang tính user-specific: 1–5 phút,
- exercise generation đắt đỏ: 10–30 phút,
- content thay đổi thường xuyên: TTL ngắn hoặc không cache.

### Chiến lược invalidation
Invalidate cache khi:
- nội dung nguồn thay đổi,
- user yêu cầu fresh answer,
- tham số request thay đổi,
- prompt được regenerate sau feedback.

### Luồng regeneration
Khi user click “Regenerate Answer”:
- bypass cache,
- tạo request mới,
- có thể ghi đè giá trị cache cũ bằng response mới.

### Khi nào không nên dùng cache
Không dùng cache cho:
- prompt phụ thuộc vào real-time hoặc state user-specific,
- nội dung nhạy cảm hoặc cá nhân hóa cao,
- request mà freshness quan trọng hơn chi phí,
- prompt có biến động rất nhỏ nhưng ý nghĩa lớn.

### Rủi ro của stale cache
Cache cũ có thể trả về nội dung exercise cũ hoặc feedback writing cũ. Rủi ro này có thể kiểm soát nếu:
- TTL ngắn,
- cache invalidated khi regenerate explicit,
- cache key khóa chặt vào prompt và version của content.

---

## 8. Đánh giá rủi ro

### Rủi ro cao
- lưu lượng AI lặp lại từ UI,
- thiếu deduplication,
- không có queue/concurrency control,
- không có cache,
- không có rate-limit-aware retry,
- dùng single key mà không có rotation.

### Rủi ro trung bình
- prompt lớn và chưa được trim nhất quán,
- một số workflow gọi nhiều Gemini calls trong một action,
- policy timeout hơi agresive.

### Rủi ro thấp
- các flow request đơn lẻ thông thường, nếu tần suất thấp và prompt nhỏ.

---
## 8.1. Phạm vi sử dụng AI trong project

Quét code cho thấy AI không chỉ dùng cho Speaking/Writing mà là một thành phần chung của nhiều luồng nghiệp vụ trong hệ thống. Các luồng hiện có bao gồm:

- Explanation / concept help: endpoint explainConcept trong [controllers/aiController.js](controllers/aiController.js), gọi generateExplanation trong [services/aiService.js](services/aiService.js).
- Exercise generation: generatePracticeExercises trong [controllers/aiController.js](controllers/aiController.js), dùng generateExercisesForCourseSkill và refineExerciseSet cho giáo viên và người dùng.
- Writing assistance: route /exercises/:id/writing-assist trong [controllers/exerciseController.js](controllers/exerciseController.js) và UI gọi trong [src/pages/ExerciseAttemptPage.jsx](src/pages/ExerciseAttemptPage.jsx).
- Pronunciation evaluation: endpoint evaluatePronunciation trong [controllers/aiController.js](controllers/aiController.js), dùng checkPronunciation.
- Vocabulary validation: [controllers/vocabularyController.js](controllers/vocabularyController.js) gọi validateVocabularyColumnsWithAI khi bật AI validation.
- Speaking script generation và rephrasing: [controllers/aiController.js](controllers/aiController.js) và [src/components/speaking/SpeakingPracticePanel.jsx](src/components/speaking/SpeakingPracticePanel.jsx).
- Speaking assessment: route /api/speech/assess trong [routes/speech.js](routes/speech.js) và service gradeSpeechWithAI.
- Content import / exercise parsing: [services/exerciseImportService.js](services/exerciseImportService.js) có thể kích hoạt AI trong workflow import.

Kết luận: phạm vi sử dụng AI khá rộng, không phải một feature đơn lẻ. Nếu triển khai bảo vệ ở cấp endpoint riêng lẻ thì sẽ dễ bỏ sót luồng và gây rủi ro chồng chéo giữa các feature.

## 8.2. Phân tích tác động Speaking/Writing

### Speaking
- Speaking có 3 loại AI request chính:
  1. tạo script mẫu,
  2. rephrase đoạn text,
  3. đánh giá bản ghi.
- Trong [src/components/speaking/SpeakingPracticePanel.jsx](src/components/speaking/SpeakingPracticePanel.jsx), việc tạo script đã có một map in-flight để dedup cùng một câu hỏi, đây là điểm tốt. Tuy nhiên, nó chỉ áp dụng cho script generation, chưa mở rộng cho toàn bộ flow speaking.
- Các request rephrase và assessment không có lớp dedup/queue chung, nên nếu người dùng thao tác nhanh, nhiều lần trong cùng một phiên, hệ thống có thể tạo burst traffic và làm tăng tỷ lệ 429.
- Vì speaking là flow đa bước, mỗi lần user thử lại hoặc đổi câu hỏi đều có thể sinh nhiều request; đây là nơi bảo vệ tập trung ở backend sẽ có hiệu quả cao.

### Writing
- Writing hiện có nguy cơ request trùng cao hơn. Trong [src/pages/ExerciseAttemptPage.jsx](src/pages/ExerciseAttemptPage.jsx), writing-assist được gọi:
  - khi page mount,
  - lại khi user submit bài.
- Hai request này cùng phục vụ một “intent” tương tự nhưng không được giảm thiểu bằng cache hoặc dedup. Đây là một nguồn gây usage không cần thiết và làm tăng khả năng timeout/429.
- Nếu user submit nhiều lần hoặc bấm regenerate nhiều lần, rủi ro càng lớn vì mỗi lần đều có thể kích hoạt request mới tới Gemini.
- Với writing, cache + deduplication cho cùng một prompt/exercise+payload là giải pháp trực tiếp và có tác động lớn.

### Kết luận về mức độ ảnh hưởng
- Speaking là luồng multi-step, có thể bị ảnh hưởng bởi burst traffic và nhiều request liên tiếp.
- Writing là luồng có rủi ro duplicate request rõ rệt nhất.
- Vì cả hai flow đều đi qua cùng một lớp AI service ở backend, việc triển khai protection ở tầng chung sẽ có tác động tích cực tới toàn bộ hệ thống, không chỉ riêng Speaking/Writing.

---

## 9. Lộ trình triển khai

### Giai đoạn 1 — Cứng hóa nền tảng
- Mục tiêu: làm cho các call Gemini an toàn hơn và có thể quan sát được.
- Các file dự kiến thay đổi:
  - [services/aiWrapper.js](services/aiWrapper.js)
  - [services/aiService.js](services/aiService.js)
  - [tests/aiWrapper.test.js](tests/aiWrapper.test.js)
- Độ rủi ro triển khai: Thấp
- Rủi ro regression: Thấp
- Chiến lược test:
  - unit tests cho timeout handling,
  - unit tests cho retry behavior,
  - tests cho circuit-breaker open/close logic.
- Checklist migration:
  - thêm rate-limit-aware retry,
  - thêm jitter,
  - tăng timeout headroom,
  - thêm structured metrics/logging.

### Giai đoạn 2 — Traffic shaping
- Mục tiêu: ngăn burst traffic và request trùng.
- Các file dự kiến thay đổi:
  - [services/aiService.js](services/aiService.js)
  - [controllers/aiController.js](controllers/aiController.js)
  - [controllers/exerciseController.js](controllers/exerciseController.js)
- Độ rủi ro triển khai: Trung bình
- Rủi ro regression: Trung bình
- Chiến lược test:
  - mô phỏng concurrent requests,
  - kiểm tra deduplication và queueing behavior,
  - xác nhận không có duplicate Gemini calls cho cùng một in-flight request.
- Checklist migration:
  - thêm deduplication,
  - thêm queue,
  - thêm concurrency limiter,
  - đảm bảo requests được coalesce.

### Giai đoạn 3 — Tối ưu prompt và token
- Mục tiêu: giảm chi phí, latency và nguy cơ 429.
- Các file dự kiến thay đổi:
  - [services/aiService.js](services/aiService.js)
  - [services/exerciseImportService.js](services/exerciseImportService.js)
- Độ rủi ro triển khai: Trung bình
- Rủi ro regression: Trung bình
- Chiến lược test:
  - so sánh chất lượng output trước/sau khi trim prompt,
  - kiểm tra chất lượng schema và fallback behavior.
- Checklist migration:
  - trim context,
  - giảm output size khi có thể,
  - nén prompt và JSON payload.

### Giai đoạn 4 — Cache và control cho regeneration
- Mục tiêu: loại bỏ các Gemini calls không cần thiết cho cùng nội dung.
- Các file dự kiến thay đổi:
  - [services/aiService.js](services/aiService.js)
  - [controllers/aiController.js](controllers/aiController.js)
  - [controllers/exerciseController.js](controllers/exerciseController.js)
  - [src/pages/ExerciseAttemptPage.jsx](src/pages/ExerciseAttemptPage.jsx)
- Độ rủi ro triển khai: Trung bình
- Rủi ro regression: Trung bình
- Chiến lược test:
  - kiểm tra cache hit/miss behavior,
  - kiểm tra regenerate bypass cache,
  - kiểm tra các tình huống stale-cache.
- Checklist migration:
  - thêm cache layer,
  - định nghĩa rule invalidation rõ ràng,
  - đảm bảo regenerate bypass cache.

---

## 10. Khuyến nghị cuối cùng

1. Xem đường dẫn Gemini hiện tại là production-risky và cần thêm request management trước khi thêm feature mới.
2. Triển khai backend-side request queue với concurrency limits trước; đây là lớp bảo vệ mạnh nhất chống 429 khi có burst traffic.
3. Thêm cache và deduplication cho các prompt lặp lại hoặc tương đương, đặc biệt cho writing-assist và exercise-generation.
4. Làm retry logic nhận biết rate-limit và dùng backoff có jitter; không nên xử lý mọi lỗi như nhau.
5. Giảm kích thước prompt và output một cách có hệ thống, đặc biệt ở các flow exercise-generation và speech-assessment.
6. Thêm metrics và logs cho latency, request count, retry count và Gemini error rate.
7. Đảm bảo “Regenerate Answer” bypass cache và buộc request mới tới Gemini.
