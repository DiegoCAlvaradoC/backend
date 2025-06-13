const express = require('express');
const router = express.Router();
const ocrController = require('../controllers/ocrController'); // AGREGAR ESTA LÍNEA
const { 
  uploadCarnetComplete, 
  uploadSingleImage, 
  handleUploadError, 
  validateUploadedFiles,
  cleanupOnError 
} = require('../middleware/upload');

// Middleware común para todas las rutas OCR
router.use(cleanupOnError);

/**
 * POST /api/ocr/process-complete
 * Procesa carnet completo (ambos lados) - ENDPOINT PRINCIPAL
 */
router.post('/process-complete', 
  uploadCarnetComplete,
  handleUploadError,
  validateUploadedFiles,
  ocrController.processComplete
);

/**
 * POST /api/ocr/process-carnet-public  
 * Procesa un solo lado del carnet
 */
router.post('/process-carnet-public',
  uploadSingleImage,
  handleUploadError,
  validateUploadedFiles,
  ocrController.processCarnetPublic
);

/**
 * POST /api/ocr/validate-image
 * Valida imagen sin procesarla
 */
router.post('/validate-image',
  uploadSingleImage,
  handleUploadError,
  validateUploadedFiles,
  ocrController.validateImage
);

/**
 * GET /api/ocr/health
 * Health check del servicio
 */
router.get('/health', ocrController.health);

/**
 * GET /api/ocr/info
 * Información del servicio
 */
router.get('/info', ocrController.info);

/**
 * GET /api/ocr/stats
 * Estadísticas del servicio
 */
router.get('/stats', ocrController.stats);

/**
 * POST /api/ocr/process-base64
 * Procesa carnet completo usando imágenes en Base64
 * Para compatibilidad con React Native Web
 */
router.post('/process-base64', ocrController.processBase64);

/**
 * GET /api/ocr/health-base64
 * Verifica que el endpoint Base64 esté funcionando
 */
router.get('/health-base64', ocrController.healthBase64);

module.exports = router;