const ocrService = require('../services/ocrService');
const path = require('path');
const fs = require('fs').promises;

class OCRController {
  
  /**
   * Procesa carnet completo (ambos lados) - ENDPOINT PRINCIPAL para el frontend
   */
  async processComplete(req, res) {
    try {
      console.log('📝 Procesando carnet completo...');
      console.log('📋 Headers recibidos:', req.headers);
      console.log('📋 Body keys:', Object.keys(req.body || {}));
      console.log('📋 Files recibidos:', Object.keys(req.files || {}));
      
      // Validar que se enviaron ambas imágenes
      if (!req.files) {
        console.log('❌ No se recibieron archivos');
        return res.status(400).json({
          success: false,
          message: 'No se recibieron archivos. Asegúrate de enviar las imágenes como multipart/form-data.'
        });
      }

      if (!req.files.frontImage || !req.files.backImage) {
        console.log('❌ Archivos faltantes:', {
          frontImage: !!req.files.frontImage,
          backImage: !!req.files.backImage,
          fieldsReceived: Object.keys(req.files)
        });
        return res.status(400).json({
          success: false,
          message: 'Se requieren ambas imágenes del carnet (frontImage y backImage)',
          received: Object.keys(req.files),
          expected: ['frontImage', 'backImage']
        });
      }

      const frontImage = req.files.frontImage[0];
      const backImage = req.files.backImage[0];

      console.log('📂 Archivos recibidos:');
      console.log(`   - Frontal: ${frontImage.originalname} (${frontImage.size} bytes)`);
      console.log(`   - Posterior: ${backImage.originalname} (${backImage.size} bytes)`);

      // Procesar ambas imágenes con OCR
      const result = await ocrService.processCompleteCarnet(
        frontImage.path,
        backImage.path
      );

      // Limpiar archivos temporales
      await OCRController.cleanupFiles([frontImage.path, backImage.path]);

      // Responder con el formato que espera el frontend
      res.json(result);

    } catch (error) {
      console.error('❌ Error en processComplete:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error procesando carnet'
      });
    }
  }

  /**
   * Procesa un solo lado del carnet
   */
  async processCarnetPublic(req, res) {
    try {
      console.log('📝 Procesando lado individual del carnet...');
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere una imagen del carnet'
        });
      }

      const side = req.body.side || 'front';
      const image = req.file;

      console.log(`📂 Procesando lado ${side}: ${image.originalname}`);

      // Procesar imagen individual
      const imageData = await ocrService.processImage(image.path, side);
      
      // Limpiar archivo temporal
      await OCRController.cleanupFiles([image.path]);

      res.json({
        success: true,
        data: {
          side: side,
          rawText: imageData.rawText,
          confidence: imageData.confidence,
          extractedFields: this.extractBasicFields(imageData.rawText, side)
        }
      });

    } catch (error) {
      console.error('❌ Error en processCarnetPublic:', error);
      res.status(500).json({
        success: false,
        message: 'Error procesando el carnet',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
      });
    }
  }

  /**
   * Valida imagen sin procesarla completamente
   */
  async validateImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere una imagen para validar'
        });
      }

      const image = req.file;
      
      // Validaciones básicas
      const validation = {
        filename: image.originalname,
        size: image.size,
        mimetype: image.mimetype,
        isValid: true,
        errors: []
      };

      // Validar tamaño
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 5000000;
      if (image.size > maxSize) {
        validation.isValid = false;
        validation.errors.push('Archivo demasiado grande');
      }

      // Validar tipo MIME
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(image.mimetype)) {
        validation.isValid = false;
        validation.errors.push('Tipo de archivo no soportado');
      }

      // Limpiar archivo temporal
      await OCRController.cleanupFiles([image.path]);

      res.json({
        success: true,
        data: validation
      });

    } catch (error) {
      console.error('❌ Error en validateImage:', error);
      res.status(500).json({
        success: false,
        message: 'Error validando imagen'
      });
    }
  }

  /**
   * Health check del servicio OCR
   */
  async health(req, res) {
    try {
      const healthStatus = await ocrService.healthCheck();
      
      res.json({
        success: true,
        data: healthStatus
      });

    } catch (error) {
      console.error('❌ Error en health check:', error);
      res.status(503).json({
        success: false,
        message: 'Servicio no disponible',
        error: error.message
      });
    }
  }

  /**
   * Información del servicio OCR
   */
  async info(req, res) {
    try {
      const serviceInfo = ocrService.getServiceInfo();
      
      res.json({
        success: true,
        data: serviceInfo
      });

    } catch (error) {
      console.error('❌ Error obteniendo info del servicio:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo información del servicio'
      });
    }
  }

  /**
   * Estadísticas del servicio OCR
   */
  async stats(req, res) {
    try {
      // TODO: Implementar estadísticas reales desde la BD
      const stats = {
        totalProcessed: 0,
        successRate: 100,
        averageConfidence: 85,
        processingTime: '2.5s',
        lastProcessed: new Date().toISOString(),
        activeRequests: 0
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas'
      });
    }
  }

  /**
   * Extrae campos básicos según el lado del carnet
   */
  extractBasicFields(text, side) {
    const fields = {};
    
    if (side === 'front') {
      fields.ci = this.extractSimpleField(text, /(\d{7,8})/);
      fields.nombres = this.extractSimpleField(text, /(?:NOMBRES?)[\s:]*([A-Za-záéíóúñ\s]+)/i);
      fields.apellidos = this.extractSimpleField(text, /(?:APELLIDOS?)[\s:]*([A-Za-záéíóúñ\s]+)/i);
    } else if (side === 'back') {
      fields.padre = this.extractSimpleField(text, /(?:PADRE)[\s:]*([A-Za-záéíóúñ\s]+)/i);
      fields.madre = this.extractSimpleField(text, /(?:MADRE)[\s:]*([A-Za-záéíóúñ\s]+)/i);
      fields.domicilio = this.extractSimpleField(text, /(?:DOMICILIO)[\s:]*([A-Za-záéíóúñ0-9\s,#\.\-]+)/i);
    }

    return fields;
  }

  /**
   * Extrae un campo simple usando regex
   */
  extractSimpleField(text, pattern) {
    const match = text.match(pattern);
    return match ? match[1].trim() : null;
  }

  /**
   * Limpia archivos temporales - método estático
   */
  static async cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`🗑️ Archivo limpiado: ${path.basename(filePath)}`);
      } catch (error) {
        console.warn(`⚠️ No se pudo limpiar archivo: ${filePath}`);
      }
    }
  }
  /**
   * Procesa carnet completo desde Base64 (React Native Web compatible)
   */
  async processBase64(req, res) {
    const startTime = Date.now();
    
    try {
      console.log(`📨 ${new Date().toISOString()} - POST /api/ocr/process-base64`);
      console.log('📋 Headers recibidos:', {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'user-agent': req.headers['user-agent'],
        'origin': req.headers['origin']
      });
      
      const { frontImage, backImage, format } = req.body;
      
      console.log('📝 Datos recibidos:');
      console.log('- frontImage:', frontImage ? `${frontImage.length} caracteres` : 'NO RECIBIDO');
      console.log('- backImage:', backImage ? `${backImage.length} caracteres` : 'NO RECIBIDO');
      console.log('- format:', format);

      // Validar que se recibieron ambas imágenes
      if (!frontImage || !backImage) {
        console.log('❌ Faltan imágenes Base64');
        return res.status(400).json({
          success: false,
          message: 'Se requieren ambas imágenes en Base64 (frontImage y backImage)',
          received: {
            frontImage: !!frontImage,
            backImage: !!backImage,
            frontImageLength: frontImage ? frontImage.length : 0,
            backImageLength: backImage ? backImage.length : 0
          },
          expected: ['frontImage', 'backImage']
        });
      }

      // Validar formato Base64
      console.log('🔍 Validando formato Base64...');
      
      const frontValidation = ocrService.validateBase64Image(frontImage);
      if (!frontValidation.isValid) {
        console.log('❌ Imagen frontal inválida:', frontValidation.error);
        return res.status(400).json({
          success: false,
          message: `Imagen frontal inválida: ${frontValidation.error}`,
          field: 'frontImage'
        });
      }

      const backValidation = ocrService.validateBase64Image(backImage);
      if (!backValidation.isValid) {
        console.log('❌ Imagen posterior inválida:', backValidation.error);
        return res.status(400).json({
          success: false,
          message: `Imagen posterior inválida: ${backValidation.error}`,
          field: 'backImage'
        });
      }

      console.log('✅ Validación Base64 exitosa');

      // Procesar con OCR
      console.log('🔄 Iniciando procesamiento OCR Base64...');
      const result = await ocrService.processCompleteCarnetBase64(frontImage, backImage);

      const processingTime = Date.now() - startTime;
      console.log(`⏱️ Tiempo de procesamiento: ${processingTime}ms`);

      if (result.success) {
        console.log('✅ OCR Base64 procesado exitosamente');
        console.log(`📊 Datos extraídos: CI=${result.data.completeData?.ci}, Nombres=${result.data.completeData?.nombres}`);
        
        // Agregar información adicional
        result.data.processingDetails = {
          ...result.data.processingDetails,
          processingTimeMs: processingTime,
          method: 'base64',
          endpoint: '/api/ocr/process-base64',
          requestTimestamp: new Date().toISOString()
        };
        
        res.json(result);
      } else {
        console.log('❌ Error en procesamiento OCR Base64:', result.message);
        res.status(500).json({
          ...result,
          processingTimeMs: processingTime,
          method: 'base64'
        });
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Error crítico en endpoint Base64:', error);
      console.error('📋 Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor procesando Base64',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
        processingTimeMs: processingTime,
        method: 'base64',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Health check específico para Base64
   */
  async healthBase64(req, res) {
    try {
      console.log('🔍 Health check Base64...');
      
      const health = await ocrService.healthCheck();
      
      // Test adicional: validar un Base64 simple
      const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const base64Test = ocrService.validateBase64Image(testBase64);
      
      console.log('✅ Health check Base64 completado');
      
      res.json({
        success: true,
        data: {
          ...health,
          endpoint: '/api/ocr/process-base64',
          method: 'base64',
          supportedFormats: ['base64'],
          base64Validation: base64Test.isValid,
          features: {
            tempFileSupport: true,
            automaticCleanup: true,
            maxImageSize: '10MB',
            supportedEncodings: ['base64']
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('❌ Error en health check Base64:', error);
      
      res.status(500).json({
        success: false,
        message: 'Health check Base64 falló',
        error: error.message,
        endpoint: '/api/ocr/process-base64',
        method: 'base64',
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = new OCRController();