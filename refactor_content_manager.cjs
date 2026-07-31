const fs = require('fs');

const srcFile = 'C:/Users/PHT/Downloads/lingua-admin-system/src/pages/AdminContentManager.jsx';
const destFile = 'E:/ai_languages_learn/src/pages/AdminContentManager.jsx';

let content = fs.readFileSync(srcFile, 'utf8');

// 1. Remove useAuth and useToast imports
content = content.replace(/import \{ useToast \} from '\.\.\/context\/ToastContext';\r?\n/, '');
content = content.replace(/import \{ useAuth \} from '\.\.\/context\/AuthContext';\r?\n/, '');

// 2. Change UI imports
content = content.replace(/from '\.\.\/components\/ui\//g, "from '../components/admin/ui/");

// 3. Replace inside the component
content = content.replace(/const \{ notify \} = useToast\(\);/, `const [globalMsg, setGlobalMsg] = useState(null);
  const notify = (text, type = 'success') => {
    setGlobalMsg({ text, type });
    setTimeout(() => setGlobalMsg(null), 3000);
  };`);
  
content = content.replace(/const \{ currentUser \} = useAuth\(\);/, "const currentUser = JSON.parse(localStorage.getItem('user') || '{}');");

// 4. Add globalMsg render
const msgJsx = `{globalMsg && (
        <div className={\`mb-6 p-4 rounded-admin text-sm font-medium border \${
          globalMsg.type === 'success' ? 'bg-admin-success-soft text-admin-success border-admin-success/20' : 'bg-admin-danger-soft text-admin-danger border-admin-danger/20'
        }\`}>
          {globalMsg.text}
        </div>
      )}`;
      
// Insert msgJsx right after <PageHeader ... />
content = content.replace(/(<PageHeader[\s\S]*?\/>)/, `$1\n\n      ${msgJsx}`);

// 5. Replace Tailwind classes using regex word boundaries
const replacements = {
  'bg-card': 'bg-admin-card',
  'text-card-foreground': 'text-admin-card-foreground',
  'border-border': 'border-admin-border',
  'text-muted-foreground': 'text-admin-muted-foreground',
  'bg-muted': 'bg-admin-muted',
  'bg-background': 'bg-admin-background',
  'text-foreground': 'text-admin-foreground',
  'focus:border-ring': 'focus:border-admin-ring',
  'focus:ring-ring/30': 'focus:ring-admin-ring/30',
  'hover:bg-muted': 'hover:bg-admin-muted',
  'hover:text-card-foreground': 'hover:text-admin-card-foreground',
  'bg-danger-soft': 'bg-admin-danger-soft',
  'text-\\[var\\(--color-danger\\)\\]': 'text-admin-danger',
  'hover:bg-danger-soft': 'hover:bg-admin-danger-soft',
  'bg-primary': 'bg-admin-primary',
  'text-primary-foreground': 'text-admin-primary-foreground',
  'text-primary': 'text-admin-primary',
  'bg-primary-soft': 'bg-admin-primary-soft',
  'border-primary': 'border-admin-primary',
  'text-\\[var\\(--color-success\\)\\]': 'text-admin-success',
  'hover:bg-success-soft': 'hover:bg-admin-success-soft',
  'rounded-\\[var\\(--radius-sm\\)\\]': 'rounded-admin-sm',
  'rounded-\\[var\\(--radius\\)\\]': 'rounded-admin',
  'shadow-\\[var\\(--shadow-card\\)\\]': 'shadow-admin-card',
  'border-border/60': 'border-admin-border/60',
  'hover:bg-muted/40': 'hover:bg-admin-muted/40'
};

for (const [key, value] of Object.entries(replacements)) {
  const regex = new RegExp(key, 'g');
  content = content.replace(regex, value);
}

fs.writeFileSync(destFile, content);
console.log('Successfully refactored AdminContentManager.jsx!');
