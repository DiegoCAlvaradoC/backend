const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Crear directorio de uploads si no existe
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Directorio de uploads creado: ${uploadDir}`);
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único con timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `carnet-${uniqueSuffix}${extension}`);
  }
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
  // Tipos MIME permitidos
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png'
  ];

  // Extensiones permitidas
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido. Solo se aceptan: ${allowedExtensions.join(', ')}`), false);
  }
};

// Configuración principal de multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB por defecto
    files: 5 // Máximo 5 archivos por request
  }
});

// Middleware para carnet completo (frontal y posterior)
const uploadCarnetComplete = upload.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 }
]);

// Middleware para una sola imagen
const uploadSingleImage = upload.single('image');

// Middleware para múltiples imágenes (documentos adicionales)
const uploadMultipleImages = upload.array('images', 5);

// Middleware de manejo de errores para multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ Error de Multer:', err.message);
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: `Archivo demasiado grande. Tamaño máximo: ${Math.round((parseInt(process.env.MAX_FILE_SIZE) || 5000000) / 1024 / 1024)}MB`
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Demasiados archivos. Máximo permitido: 5'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Campo de archivo inesperado. Verifica los nombres de los campos'
        });
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Error subiendo archivo',
          error: err.message
        });
    }
  } else if (err) {
    console.error('❌ Error general en upload:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

// Middleware de validación post-upload
const validateUploadedFiles = (req, res, next) => {
  try {
    // Log de archivos recibidos
    if (req.files) {
      console.log('📁 Archivos recibidos:');
      Object.keys(req.files).forEach(fieldName => {
        const files = req.files[fieldName];
        files.forEach(file => {
          console.log(`   - ${fieldName}: ${file.originalname} (${file.size} bytes)`);
        });
      });
    } else if (req.file) {
      console.log(`📁 Archivo recibido: ${req.file.originalname} (${req.file.size} bytes)`);
    }

    // Validaciones adicionales pueden ir aquí
    
    next();
  } catch (error) {
    console.error('❌ Error validando archivos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validando archivos subidos'
    });
  }
};

// Middleware para limpiar archivos en caso de error
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data) {
    if (res.statusCode >= 400) {
      cleanupFiles(req);
    }
    originalSend.call(this, data);
  };

  res.json = function(data) {
    if (res.statusCode >= 400) {
      cleanupFiles(req);
    }
    originalJson.call(this, data);
  };

  next();
};

// Función auxiliar para limpiar archivos
const cleanupFiles = (req) => {
  const filesToClean = [];

  if (req.files) {
    Object.keys(req.files).forEach(fieldName => {
      req.files[fieldName].forEach(file => {
        filesToClean.push(file.path);
      });
    });
  } else if (req.file) {
    filesToClean.push(req.file.path);
  }

  filesToClean.forEach(filePath => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.warn(`⚠️ No se pudo limpiar archivo: ${filePath}`);
      } else {
        console.log(`🗑️ Archivo limpiado por error: ${path.basename(filePath)}`);
      }
    });
  });
};

module.exports = {
  uploadCarnetComplete,
  uploadSingleImage,
  uploadMultipleImages,
  handleUploadError,
  validateUploadedFiles,
  cleanupOnError
};