// Lỗi upload (multer) -> thông báo tiếng Việt dễ hiểu, mã 400 (lỗi của file gửi lên, không phải lỗi server)
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'File quá lớn so với giới hạn cho phép',
  LIMIT_FILE_COUNT: 'Gửi quá nhiều file một lần',
  LIMIT_UNEXPECTED_FILE: 'Trường file không đúng hoặc quá nhiều file'
};

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  const multer = err.name === 'MulterError';
  const statusCode = err.statusCode || (multer || err.uploadRejected ? 400 : 500);
  const message = (multer && MULTER_MESSAGES[err.code]) || err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    message, // trang quản trị đọc `message`
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export default errorHandler;
