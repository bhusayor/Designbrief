# Quick Reference: File Upload Modal

## What's Been Implemented

✅ **FileUploadModal Component** - Refined upload interface with:
- Document upload with format badges
- Image thumbnails with multiple support
- Smooth animations
- Google Material Icons

✅ **Updated ChatComponent** - Plus button with:
- File attachment preview
- Integration with modal
- Support for both images and documents

✅ **Two-Font System**:
- **Apple Font** (system): -apple-system, BlinkMacSystemFont, 'Segoe UI'
- **DM Mono** (code): 'DM Mono' from Google Fonts

✅ **Google Material Icons** - Ready to use from https://fonts.google.com/icons

---

## Key Features

### Modal Positioning
- Positioned **above the plus icon** when opened
- Smooth slide-up animation
- Backdrop blur effect
- Click-outside to close

### Document Preview
Shows clean cards with:
- File icon
- Filename (in DM Mono font)
- File format badge (PDF, DOC, etc.)
- File size
- Remove button

### Image Preview
Displays:
- Thumbnail grid (responsive)
- Image preview on hover
- Quick remove overlay (opacity overlay on hover)
- Supports multiple images

### File Management
- Select multiple files at once
- Preview before sending
- Remove individual files
- Clear file list on send

---

## How to Use

### 1. Click the Plus Button
Located in the chat input area, below the message box.

### 2. Upload Files
Choose between:
- **Documents**: PDF, Word, Excel, PowerPoint, TXT
- **Images**: PNG, JPG, GIF, WebP, etc.

### 3. Add to Chat
Files appear as small preview chips above the input field. Click "Add to Chat" in the modal to send them with your message.

---

## Customization

### Change Colors
Edit `FileUploadModal.css`:
```css
:root {
  --accent-primary: #YOUR-COLOR;
  --accent-hover: #HOVER-COLOR;
}
```

### Change Icons
Browse https://fonts.google.com/icons and replace icon names:
```jsx
<span className="material-icons">your_icon_name</span>
```

### Adjust Fonts
Edit `FileUploadModal.css`:
```css
--font-system: 'Your Font', sans-serif;
--font-mono: 'Your Mono Font', monospace;
```

---

## File Structure

```
src/
├── components/
│   ├── FileUploadModal.jsx       ← Main component
│   ├── FileUploadModal.css       ← Styles + font imports
│   ├── ChatComponent.jsx         ← Updated with modal
│   └── ChatComponent.css
├── App.jsx
└── main.jsx
```

---

## Technical Specs

- **React Hooks**: useState for state management
- **File API**: FileReader for image previews
- **CSS**: Tailwind + custom animations
- **Icons**: Google Material Icons
- **Fonts**: Apple System Font + DM Mono from Google
- **Animations**: CSS keyframes (smooth, performant)
- **Browser Support**: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)

---

## Icons Reference

Commonly used in the modal:

| Icon | Usage |
|------|-------|
| `upload_file` | Document upload button |
| `add_photo_alternate` | Image upload button |
| `description` | Documents section header |
| `image` | Images section header |
| `insert_drive_file` | File icon in preview |
| `close` | Remove/close buttons |
| `add` | Plus button (main CTA) |

More icons: https://fonts.google.com/icons

---

## CSS Classes Overview

**Modal Structure:**
- `.modal-overlay` - Background + backdrop blur
- `.modal-content` - Modal container
- `.modal-header` - Title section
- `.upload-container` - Content area
- `.modal-footer` - Action buttons

**Upload Sections:**
- `.upload-section` - Document/Image section
- `.upload-button` - Upload trigger
- `.file-card` - Document preview
- `.image-card` - Image thumbnail

**Responsive:**
- Mobile: Full viewport (with safe padding)
- Desktop: 600px max-width
- Tablet: Adjusts between mobile/desktop

---

## Next Steps

1. **Test the modal** - Click the plus icon in chat
2. **Upload files** - Try both documents and images
3. **Customize colors** - Edit CSS variables if needed
4. **Adjust fonts** - Change font stacks if preferred
5. **Deploy** - Build and deploy when ready

---

**Component Status**: ✅ Production Ready
**Last Updated**: March 2026
