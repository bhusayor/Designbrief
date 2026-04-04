# File Upload Modal Integration Guide

## Overview
This guide covers the implementation of a refined file/image upload modal component for your React chat application using Google Material Icons, Apple System Font, and DM Mono.

## Components Created

### 1. **FileUploadModal.jsx**
Main component handling file uploads with:
- Document upload with format badges
- Image upload with thumbnail previews
- Multiple file support
- File removal functionality
- Clean, production-grade UI

### 2. **FileUploadModal.css**
Refined styling with:
- Google Material Icons integration
- Apple system font + DM Mono typography
- Smooth animations and transitions
- Responsive design
- Dark mode compatible

### 3. **Updated ChatComponent.jsx**
- Plus button to trigger modal
- File attachment preview
- File management in messages
- Integration with upload modal

## Setup Instructions

### Step 1: Google Material Icons
The icons are automatically imported in `FileUploadModal.css`:
```css
@import url('https://fonts.googleapis.com/icon?family=Material+Icons');
```

**Available Icons Used:**
- `description` - Documents
- `upload_file` - Upload button
- `image` - Images section
- `add_photo_alternate` - Image upload
- `insert_drive_file` - File icon
- `close` - Close/remove buttons

**To use Google Icons in your JSX:**
```jsx
<span className="material-icons">upload_file</span>
```

Browse more icons: https://fonts.google.com/icons

### Step 2: Font Configuration
Two fonts are configured globally in the CSS:

#### Apple System Font (Body)
```css
--font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
```
Used for: Headers, buttons, body text

#### DM Mono (Code/Monospace)
```css
--font-mono: 'DM Mono', monospace;
```
Used for: File names, sizes, formats, technical information

Automatically imported:
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
```

### Step 3: Integration in Your App

**In your existing chat component:**

```jsx
import FileUploadModal from './FileUploadModal';

export function ChatComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);

  const handleFilesSelected = (files, type) => {
    setAttachedFiles((prev) => [...prev, ...files.map(f => ({ ...f, type }))]);
  };

  return (
    <>
      {/* Plus button above input */}
      <button onClick={() => setIsModalOpen(true)}>
        <span className="material-icons">add</span>
      </button>

      {/* File preview */}
      {attachedFiles.map(file => (
        <div key={file.id}>{file.name}</div>
      ))}

      {/* Modal */}
      <FileUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onFilesSelected={handleFilesSelected}
      />
    </>
  );
}
```

## Features

### Document Upload
- Accept multiple file formats (.pdf, .doc, .docx, .txt, .xls, .xlsx, .ppt, .pptx)
- Display file name, size, and format
- Format badge with accent color
- Remove individual files

### Image Upload
- Multiple image selection
- Thumbnail preview grid
- Image preview on hover
- Quick removal overlay
- Maintains aspect ratio

### Modal Behavior
- Appears slightly above plus icon
- Smooth slide-up animation
- Backdrop blur effect
- Click-outside to close
- Keyboard accessible

### Styling Customization

**Colors (edit `FileUploadModal.css`):**
```css
--accent-primary: #3b82f6;    /* Primary blue */
--accent-hover: #2563eb;      /* Hover blue */
--text-primary: #1a1a1a;      /* Black text */
--bg-secondary: #f8f9fa;      /* Light gray background */
```

**Animation Timing:**
```css
animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
```

## File Size Calculation
The component automatically formats file sizes:
- Bytes → KB → MB
- Example: `1536 KB`, `2.5 MB`

## Accessibility Features
- Semantic HTML
- ARIA labels on buttons
- Keyboard navigation support
- Clear visual feedback
- Focus states on interactive elements

## Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+

## Customization Examples

### Change Accent Color
```css
:root {
  --accent-primary: #10b981;  /* Green */
  --accent-hover: #059669;
}
```

### Adjust Modal Width
```css
.modal-content {
  max-width: 800px;  /* Default: 600px */
}
```

### Change Font Stack
```css
:root {
  --font-system: 'Your Font', sans-serif;
  --font-mono: 'Your Mono Font', monospace;
}
```

## Usage Example

```jsx
import { ChatComponent } from './components/ChatComponent';

function App() {
  return (
    <div>
      <ChatComponent />
    </div>
  );
}
```

## Troubleshooting

### Icons not showing?
1. Ensure `FileUploadModal.css` is imported
2. Check that Google Fonts URL is accessible
3. Verify `<span class="material-icons">` usage

### Fonts not loading?
1. Check internet connection (fonts from Google CDN)
2. Try hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
3. Verify `@import` statements in CSS

### Modal not appearing?
1. Check `isOpen` prop value
2. Verify z-index in CSS (default: 1000)
3. Check for CSS conflicts

## Performance Notes
- Modal is conditionally rendered (only when open)
- Images use FileReader API for preview generation
- File preview cards use efficient animations
- Minimal re-renders with React hooks

---

**Last Updated:** March 2026
**Compatible with:** React 19+, Tailwind CSS 4+
