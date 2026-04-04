import { useState, useRef } from 'react';
import './FileUploadModal.css';

export function FileUploadModal({ isOpen, onClose, onFilesSelected }) {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const handleFileUpload = (e, type) => {
    const files = Array.from(e.target.files || []);

    if (type === 'documents') {
      const newFiles = files.map(file => ({
        id: Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
        format: file.name.split('.').pop().toUpperCase()
      }));
      setUploadedFiles(prev => [...prev, ...newFiles]);
      if (onFilesSelected) onFilesSelected(newFiles, 'document');
    } else if (type === 'images') {
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const newImage = {
            id: Math.random(),
            name: file.name,
            src: event.target.result,
            file: file,
          };
          setUploadedImages(prev => [...prev, newImage]);
          if (onFilesSelected) onFilesSelected([newImage], 'image');
        };
        reader.readAsDataURL(file);
      });
    }

    e.target.value = '';
  };

  const removeFile = (id, type) => {
    if (type === 'document') {
      setUploadedFiles(prev => prev.filter(f => f.id !== id));
    } else if (type === 'image') {
      setUploadedImages(prev => prev.filter(img => img.id !== id));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <h3 className="modal-title">Add Files & Images</h3>
              <button className="close-button" onClick={onClose}>
                <span className="material-icons">close</span>
              </button>
            </div>

            {/* Upload Sections */}
            <div className="upload-container">
              {/* Documents Section */}
              <div className="upload-section">
                <div className="section-header">
                  <span className="material-icons section-icon">description</span>
                  <h4 className="section-title">Documents</h4>
                </div>
                <label className="upload-button documents">
                  <span className="material-icons upload-icon">upload_file</span>
                  <span className="upload-text">Upload Document</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'documents')}
                    className="hidden-input"
                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx"
                  />
                </label>

                {/* Document Preview Cards */}
                {uploadedFiles.length > 0 && (
                  <div className="files-preview">
                    {uploadedFiles.map(file => (
                      <div key={file.id} className="file-card">
                        <div className="file-icon-wrapper">
                          <span className="material-icons">insert_drive_file</span>
                        </div>
                        <div className="file-info">
                          <p className="file-name">{file.name}</p>
                          <div className="file-meta">
                            <span className="file-format">{file.format}</span>
                            <span className="file-size">{formatFileSize(file.size)}</span>
                          </div>
                        </div>
                        <button
                          className="remove-button"
                          onClick={() => removeFile(file.id, 'document')}
                          aria-label="Remove file"
                        >
                          <span className="material-icons">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images Section */}
              <div className="upload-section">
                <div className="section-header">
                  <span className="material-icons section-icon">image</span>
                  <h4 className="section-title">Images</h4>
                </div>
                <label className="upload-button images">
                  <span className="material-icons upload-icon">add_photo_alternate</span>
                  <span className="upload-text">Upload Images</span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'images')}
                    className="hidden-input"
                    accept="image/*"
                  />
                </label>

                {/* Image Preview Grid */}
                {uploadedImages.length > 0 && (
                  <div className="images-preview">
                    {uploadedImages.map(image => (
                      <div key={image.id} className="image-card">
                        <img src={image.src} alt={image.name} className="image-thumbnail" />
                        <button
                          className="remove-button image-remove"
                          onClick={() => removeFile(image.id, 'image')}
                          aria-label="Remove image"
                        >
                          <span className="material-icons">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button className="button-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="button-primary"
                onClick={onClose}
                disabled={uploadedFiles.length === 0 && uploadedImages.length === 0}
              >
                Add to Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FileUploadModal;
