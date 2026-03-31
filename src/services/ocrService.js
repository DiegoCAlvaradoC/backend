const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class OCRService {
  constructor() {
    this.confidenceThreshold = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD) || 60;
    this.language = process.env.OCR_LANGUAGE || 'spa';
  }

  /**
   * Procesa ambos lados del carnet y extrae información completa
   */
  async processCompleteCarnet(frontImagePath, backImagePath) {
    try {
      console.log(' Iniciando procesamiento OCR completo...');
      
      // Validar calidad de imágenes antes de procesar
      const frontQuality = await this.validateImageQuality(frontImagePath);
      const backQuality = await this.validateImageQuality(backImagePath);
      
      console.log(` Calidad frontal: ${frontQuality.score}/100`);
      console.log(` Calidad posterior: ${backQuality.score}/100`);
      
      // Procesar ambas imágenes en paralelo
      const [frontData, backData] = await Promise.all([
        this.processImage(frontImagePath, 'front'),
        this.processImage(backImagePath, 'back')
      ]);

      // Combinar datos de ambos lados
      const completeData = this.combineCarnetData(frontData, backData);
      
      // Calcular confianza promedio
      const averageConfidence = this.calculateAverageConfidence(frontData, backData);
      
      // Validar datos extraídos
      const validation = this.validateExtractedData(completeData);

      const result = {
        success: true,
        data: {
          completeData,
          averageConfidence,
          validation,
          frontData: frontData.rawText,
          backData: backData.rawText,
          imageQuality: {
            front: frontQuality,
            back: backQuality
          },
          processingDetails: {
            frontConfidence: frontData.confidence,
            backConfidence: backData.confidence,
            timestamp: new Date().toISOString()
          }
        }
      };

      console.log(' OCR procesado exitosamente');
      console.log(` Confianza promedio: ${averageConfidence}%`);
      
      // Advertir si la calidad de imagen es baja
      if (averageConfidence < 50) {
        console.log(' RECOMENDACIÓN: Mejorar la calidad de las imágenes para mejores resultados');
      }
      
      return result;

    } catch (error) {
      console.error(' Error en procesamiento OCR:', error);
      return {
        success: false,
        message: 'Error procesando el carnet',
        error: error.message
      };
    }
  }

  /**
   * Valida la calidad de una imagen para OCR
   */
  async validateImageQuality(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const stats = await sharp(imagePath).stats();
      
      let score = 100;
      const issues = [];
      
      // Verificar resolución mínima
      if (metadata.width < 600 || metadata.height < 400) {
        score -= 30;
        issues.push('Resolución muy baja');
      }
      
      // Verificar contraste (diferencia entre max y min)
      const contrast = stats.channels[0].max - stats.channels[0].min;
      if (contrast < 100) {
        score -= 20;
        issues.push('Bajo contraste');
      }
      
      // Verificar nitidez usando la desviación estándar
      if (stats.channels[0].stdev < 30) {
        score -= 20;
        issues.push('Imagen borrosa');
      }
      
      // Verificar brillo promedio
      const brightness = stats.channels[0].mean;
      if (brightness < 50 || brightness > 200) {
        score -= 15;
        issues.push('Brillo inadecuado');
      }
      
      return {
        score: Math.max(0, score),
        resolution: `${metadata.width}x${metadata.height}`,
        issues: issues,
        recommendations: this.getQualityRecommendations(issues)
      };
      
    } catch (error) {
      return {
        score: 0,
        issues: ['Error analizando imagen'],
        recommendations: ['Verificar que el archivo sea una imagen válida']
      };
    }
  }

  /**
   * Proporciona recomendaciones basadas en problemas de calidad
   */
  getQualityRecommendations(issues) {
    const recommendations = [];
    
    if (issues.includes('Resolución muy baja')) {
      recommendations.push('Tomar foto más cerca del carnet o usar mejor cámara');
    }
    if (issues.includes('Bajo contraste')) {
      recommendations.push('Mejorar iluminación y evitar sombras');
    }
    if (issues.includes('Imagen borrosa')) {
      recommendations.push('Mantener la cámara estable y enfocar bien');
    }
    if (issues.includes('Brillo inadecuado')) {
      recommendations.push('Ajustar iluminación - evitar luz muy fuerte o muy tenue');
    }
    
    return recommendations;
  }

  /**
   * Procesa una imagen individual
   */
  async processImage(imagePath, side) {
    try {
      // Optimizar imagen antes del OCR
      const optimizedImagePath = await this.optimizeImage(imagePath);
      
      console.log(` Procesando lado ${side}...`);
      
      const { data: { text, confidence } } = await Tesseract.recognize(
        optimizedImagePath,
        this.language,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`📝 ${side}: ${Math.round(m.progress * 100)}%`);
            }
          },
          // Configuración mejorada para imágenes de baja calidad
          tessedit_pageseg_mode: Tesseract.PSM.AUTO,
          tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
          preserve_interword_spaces: '1',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .,:-/',
          // Mejorar detección de texto pequeño
          textord_min_linesize: '2.5',
          // Reducir ruido
          textord_noise_rejwords: '1',
          textord_noise_rejrows: '1'
        }
      );

      // Limpiar archivo optimizado
      await fs.unlink(optimizedImagePath).catch(() => {});

      // Validar confianza mínima
      if (confidence < this.confidenceThreshold) {
        console.log(` Baja confianza en ${side}: ${confidence}%`);
      }

      return {
        rawText: text,
        confidence: confidence,
        side: side
      };

    } catch (error) {
      console.error(` Error procesando ${side}:`, error);
      throw error;
    }
  }

  /**
   * Optimiza la imagen para mejor reconocimiento OCR
   */
  async optimizeImage(imagePath) {
    const optimizedPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_optimized.png');
    
    try {
      // Obtener metadatos de la imagen
      const metadata = await sharp(imagePath).metadata();
      console.log(` Imagen original: ${metadata.width}x${metadata.height}`);
      
      // Determinar el factor de escalado óptimo
      const targetWidth = metadata.width < 800 ? 1600 : Math.max(1200, metadata.width * 1.5);
      
      await sharp(imagePath)
        // Redimensionar para mejorar resolución
        .resize(targetWidth, null, { 
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false // Permitir agrandamiento
        })
        // Mejorar contraste y nitidez
        .linear(1.2, -(128 * 1.2) + 128) // Aumentar contraste
        .sharpen({ sigma: 1, flat: 1, jagged: 2 })
        // Reducir ruido
        .median(2)
        // Normalizar brillo
        .normalise()
        // Convertir a escala de grises para mejor OCR
        .greyscale()
        // Guardar con alta calidad
        .png({ 
          quality: 95,
          compressionLevel: 0,
          adaptiveFiltering: false
        })
        .toFile(optimizedPath);
      
      console.log(` Imagen optimizada guardada: ${optimizedPath}`);
      return optimizedPath;
      
    } catch (error) {
      console.error(' Error optimizando imagen:', error);
      // Si falla la optimización, usar imagen original
      return imagePath;
    }
  }

  /**
   * Combina datos extraídos de ambos lados del carnet
   */
  combineCarnetData(frontData, backData) {
    const frontText = frontData.rawText;
    const backText = backData.rawText;
    const allText = `${frontText}\n${backText}`;

    // Extraer nombre completo del texto posterior 
    const nombreCompleto = this.extractNombreCompleto(backText);
    const nombres = nombreCompleto ? nombreCompleto.nombres : this.extractNombres(frontText);
    const apellidos = nombreCompleto ? nombreCompleto.apellidos : this.extractApellidos(frontText);

    return {
      ci: this.extractCI(allText),
      nombres: nombres,
      apellidos: apellidos,
      fechaNacimiento: this.extractFechaNacimiento(allText),
      lugarNacimiento: this.extractLugarNacimiento(backText),
      domicilio: this.extractDomicilio(backText),
      padre: this.extractPadre(backText),
      madre: this.extractMadre(backText),
      serie: this.extractSerie(allText)
    };
  }

  /**
   * Extrae nombre completo del texto posterior 
   */
  extractNombreCompleto(text) {
    console.log(' Texto para extraer nombre:', text.substring(0, 200));
    
    // Patrón específico para carnets bolivianos en el reverso
    const patterns = [
      /A:\s*([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+){3,4})(?:\s|$)/i,
     /A:\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)(?:\s*(?:É|Ë|È|\n|Nacido))/i,
      /A:\s*([A-ZÁÉÍÓÚÑ\s]{15,50}?)(?:\s*(?:É|È|Ë|\d|\n|$))/i,
      /([A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let nombreCompleto = match[1].trim();
        
        console.log(' Nombre encontrado:', nombreCompleto);
        
        // Limpiar texto extra común
        nombreCompleto = nombreCompleto.replace(/\s+(Des|ME|Nacido|E\s|e\s|É|È|Ë).*$/i, '');
        nombreCompleto = nombreCompleto.replace(/\s+Des$/i, '');
        nombreCompleto = nombreCompleto.replace(/\s+[A-Z]?e?s?$/i, '');
        
        // Corrección específica para errores comunes de OCR
        nombreCompleto = nombreCompleto.replace(/CAI\s+LISAYA/i, 'CALLISAYA');
        nombreCompleto = nombreCompleto.replace(/MAT EO/i, 'MATEO');
        nombreCompleto = nombreCompleto.replace(/MÁTEO/i, 'MATEO');
        
        const partes = nombreCompleto.split(/\s+/).filter(p => p.length > 1);
        
        console.log(' Partes del nombre:', partes);
        
        if (partes.length >= 4) {
          return {
            nombres: partes.slice(0, 2).join(' '),
            apellidos: partes.slice(2).join(' ')
          };
        } else if (partes.length === 3) {
          return {
            nombres: partes[0],
            apellidos: partes.slice(1).join(' ')
          };
        }
      }
    }
    
    console.log(' No se pudo extraer nombre completo');
    return null;
  }

  /**
   * Extrae número de CI del texto
   */
  extractCI(text) {
    const patterns = [
      /(?:CI|C\.I\.?|CARNET|CEDULA|No\.)[\s:]*(\d{7,8})(?:\s*-?\s*[A-Z]{2})?/i,
      /(\d{7,8})\s*-?\s*[A-Z]{2}/,
      /(?:^|\s)(\d{7,8})(?=\s|$)/m
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let ci = match[1].replace(/\s+/g, '');
        // Validar que sea un CI boliviano válido (7-8 dígitos)
        if (ci.length >= 7 && ci.length <= 8) {
          return ci;
        }
      }
    }
    return null;
  }

  /**
   * Extrae nombres del texto
   */
  extractNombres(text) {
    const patterns = [
      /(?:NOMBRES?|NAME)[\s:]*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)(?=\s*APELLIDOS?|$)/i,
      /^([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)(?=\s+[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ]+\s*$)/m
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let nombres = match[1].trim();
        // Limpiar texto extra
        nombres = nombres.replace(/\s+(Des|ME|E\s).*$/i, '');
        return nombres;
      }
    }
    return null;
  }

  /**
   * Extrae apellidos del texto
   */
  extractApellidos(text) {
    const patterns = [
      /(?:APELLIDOS?|SURNAME)[\s:]*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)/i,
      /(?:NOMBRES?[\s:]*[A-Za-záéíóúñ\s]+)[\s]*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let apellidos = match[1].trim();
        // Limpiar texto extra - MEJORADO
        apellidos = apellidos.replace(/\s+(Des|ME|Nacido|E\s).*$/i, '');
        apellidos = apellidos.replace(/\s+Des$/i, '');
        return apellidos;
      }
    }
    return null;
  }

  /**
   * Extrae fecha de nacimiento (mejorado)
   */
  extractFechaNacimiento(text) {
    console.log(' Buscando fecha en:', text.substring(0, 300));
    
    const patterns = [
      // Patrón específico "Nacido el DD de MES de YYYY" o "Nacidoel DD de MES de YYYY"
      /Nacido\s*el\s+(\d{1,2})\s+de\s+([A-Za-z]+)\s+de\s+(\d{4})/i,
      // Patrón general de fechas
      /(?:NACIMIENTO|NAC|BORN)[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        console.log(' Fecha encontrada:', match);
        
        if (match.length === 4) {
          // Formato "Nacido el DD de MES de YYYY"
          const dia = match[1].padStart(2, '0');
          const mes = this.convertirMesANumero(match[2]);
          const año = match[3];
          return `${dia}/${mes}/${año}`;
        } else {
          return this.formatDate(match[1]);
        }
      }
    }
    
    console.log(' No se encontró fecha de nacimiento');
    return null;
  }

  /**
   * Convierte nombre del mes a número
   */
  convertirMesANumero(mes) {
    const meses = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    return meses[mes.toLowerCase()] || '01';
  }

  /**
   * Extrae lugar de nacimiento
   */
  extractLugarNacimiento(text) {
    const patterns = [
      /(?:En\s+)([A-Z\s]+(?:-\s*[A-Z\s]+)*?)(?:\s+Domicilio|\s+\d|\s*$)/i,
      /(?:LUGAR DE NACIMIENTO|NACIMIENTO|BORN IN)[\s:]*([A-Za-záéíóúñ\s,]+)/i,
      /(?:LA PAZ|COCHABAMBA|SANTA CRUZ|ORURO|POTOSÍ|TARIJA|CHUQUISACA|BENI|PANDO)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let lugar = match[1] ? match[1].trim() : match[0].trim();
        // Limpiar formato específico como "LA PAZ - MURILLO - NUESTRA SEÑORA DE LA PAZ"
        lugar = lugar.replace(/\s*-\s*MURILLO.*$/i, '');
        lugar = lugar.replace(/\s*-\s*NUESTRA.*$/i, '');
        return lugar;
      }
    }
    return null;
  }

  /**
   * Extrae domicilio
   */
  extractDomicilio(text) {
    const patterns = [
      /(?:Domicilio\s+)([A-Za-záéíóúñ0-9\s,#\.\-]+?)(?:\s+ZONA|\s+Padre|\s*$)/i,
      /(?:DOMICILIO|DIRECCIÓN|ADDRESS)[\s:]*([A-Za-záéíóúñ0-9\s,#\.\-]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let domicilio = match[1].trim();
        // Limpiar números de documento y caracteres extra
        domicilio = domicilio.replace(/\s*\*?\s*\d{4}\s*\.?\s*$/, ''); // Quita "* 1317"
        domicilio = domicilio.replace(/\s*N°?\s*\d+\s*$/, '');
        domicilio = domicilio.replace(/\s*\*\s*$/, ''); // Quita asteriscos finales
        return domicilio;
      }
    }
    return null;
  }

  /**
   * Extrae nombre del padre (con limpieza mejorada)
   */
  extractPadre(text) {
    const patterns = [
      // Patrón específico para este formato: "Padre CESAR SILVIO ALVARADO TICONA/CI:2542147"
      /Padre\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)(?:\/CI:|\/C1:|\s+e\s|\s+Madre|\s*$)/i,
      /(?:Padre\s+)([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)(?:\s+e\s|\s+Madre|\s*$)/i,
      /(?:Padre|PADRE)[\s:]*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let padre = match[1].trim();
        console.log(' Padre encontrado:', padre);
        
        // Limpiar caracteres extra y saltos de línea - MEJORADO
        padre = padre.replace(/\s*[e\n\r]+\s*[A-Z]*$/i, '');
        padre = padre.replace(/\s+e\s*$/i, ''); // Quitar "e" al final
        padre = padre.replace(/\s+/g, ' ').trim();
        return padre;
      }
    }
    return null;
  }

  /**
   * Extrae nombre de la madre (con limpieza mejorada)
   */
  extractMadre(text) {
    const patterns = [
      // Patrón específico para este formato: "Madre MARIA AURORA CALLISAYA MATEO/CI:3456328"
      /Madre\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)(?:\/CI:|\/C1:|\s+uu|\s+u\s|\s*$)/i,
      /(?:Madre\s+)([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)(?:\s+uu|\s+u\s|\s*$)/i,
      /(?:Madre|MADRE)[\s:]*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let madre = match[1].trim();
        console.log(' Madre encontrada:', madre);
        
        // Limpiar caracteres extra y saltos de línea - MEJORADO
        madre = madre.replace(/\s*[u\n\r]+\s*[A-Z]*$/i, '');
        madre = madre.replace(/\s+uu?\s*$/i, ''); // Quitar "u" o "uu" al final
        madre = madre.replace(/\s+/g, ' ').trim();
        
        // Correcciones específicas de OCR
        madre = madre.replace(/MÁTEO/i, 'MATEO');
        madre = madre.replace(/MAT EO/i, 'MATEO');
        
        return madre;
      }
    }
    return null;
  }

  /**
   * Extrae serie del carnet (mejorado)
   */
  extractSerie(text) {
    console.log(' Buscando serie en:', text.substring(0, 300));
    
    const patterns = [
      // Buscar "serie" seguido de números (más flexible)
      /serie\s*(\d+)/i,
      // Buscar números después de "serie" con posibles caracteres extra
      /serie\s*[A-Za-z]*\s*(\d{4,6})/i,
      // Buscar "serie" seguido de letras y números
      /serie\s+([A-Z]+\d*)/i,
      // Buscar patrones específicos como "43333" que aparecen cerca de "serie"
      /(?:serie|BIO)[\s\S]{0,50}?(\d{4,6})/i,
      /(?:SERIE|SERIES?)[\s:]*([A-Z0-9\-]+)/i,
      /([A-Z]{2}\d{6,8})/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let serie = match[1].trim();
        console.log(' Serie encontrada:', serie);
        
        // Validar que la serie tenga un formato razonable
        if (serie.length >= 2 && serie.length <= 10) {
          // Filtrar series que sean obviamente incorrectas
          if (!['8446290', '21222', '2026', '2002'].includes(serie)) {
            return serie;
          }
        }
      }
    }
    
    console.log(' No se encontró serie válida');
    return null;
  }

  /**
   * Formatea fecha a formato estándar
   */
  formatDate(dateStr) {
    try {
      const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '');
      const parts = cleaned.split(/[\/\-\.]/);
      
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  /**
   * Calcula confianza promedio
   */
  calculateAverageConfidence(frontData, backData) {
    return Math.round((frontData.confidence + backData.confidence) / 2);
  }

  /**
   * Valida datos extraídos
   */
  validateExtractedData(data) {
    const fields = Object.keys(data);
    const validFields = fields.filter(field => data[field] && data[field].trim().length > 0);
    const completeness = Math.round((validFields.length / fields.length) * 100);
    
    const isValid = completeness >= 70 && data.ci && data.nombres;
    
    return {
      isValid: isValid,
      completeness,
      missingFields: fields.filter(field => !data[field] || data[field].trim().length === 0)
    };
  }

  /**
   * Obtiene información del servicio
   */
  getServiceInfo() {
    return {
      service: 'UCB OCR Service',
      version: '1.1.0', // Incrementada por las mejoras
      language: this.language,
      confidenceThreshold: this.confidenceThreshold,
      supportedFormats: ['jpg', 'jpeg', 'png'],
      maxFileSize: process.env.MAX_FILE_SIZE || '5MB',
      status: 'active'
    };
  }

  /**
   * Valida salud del servicio
   */
  async healthCheck() {
    try {
      // Test básico de Tesseract
      const testResult = await Tesseract.recognize(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'eng'
      );
      
      return {
        status: 'healthy',
        tesseract: 'operational',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  // Agregar estos métodos al final de la clase OCRService, antes del module.exports

/**
 * Procesa carnets desde datos Base64 (para React Native Web)
 */
async processCompleteCarnetBase64(frontImageBase64, backImageBase64) {
  try {
    console.log(' Iniciando procesamiento OCR desde Base64...');
    
    // Crear archivos temporales desde Base64
    const frontTempPath = await this.saveBase64ToTempFile(frontImageBase64, 'front');
    const backTempPath = await this.saveBase64ToTempFile(backImageBase64, 'back');
    
    console.log(' Archivos temporales creados');
    console.log(' Front temp:', frontTempPath);
    console.log(' Back temp:', backTempPath);
    
    // Usar el método existente que ya funciona
    const result = await this.processCompleteCarnet(frontTempPath, backTempPath);
    
    // Limpiar archivos temporales
    await this.cleanupTempFiles([frontTempPath, backTempPath]);
    
    console.log('Procesamiento Base64 completado y archivos limpiados');
    
    return result;

  } catch (error) {
    console.error(' Error en procesamiento Base64:', error);
    return {
      success: false,
      message: 'Error procesando el carnet desde Base64',
      error: error.message
    };
  }
}

/**
 * Guarda una imagen Base64 como archivo temporal
 */
async saveBase64ToTempFile(base64Data, prefix) {
  try {
    // Limpiar el Base64 (remover prefijos si los hay)
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Crear buffer desde Base64
    const imageBuffer = Buffer.from(cleanBase64, 'base64');
    
    // Generar nombre único para archivo temporal
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const tempPath = path.join(process.cwd(), 'temp', `${prefix}_${timestamp}_${random}.png`);
    
    // Crear directorio temp si no existe
    const tempDir = path.dirname(tempPath);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Guardar archivo
    await fs.writeFile(tempPath, imageBuffer);
    
    console.log(` Archivo Base64 guardado: ${tempPath}`);
    console.log(` Tamaño: ${imageBuffer.length} bytes`);
    
    return tempPath;
    
  } catch (error) {
    console.error(` Error guardando Base64 como archivo:`, error);
    throw new Error(`No se pudo guardar imagen Base64: ${error.message}`);
  }
}

/**
 * Limpia archivos temporales
 */
async cleanupTempFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      console.log(` Archivo temporal eliminado: ${filePath}`);
    } catch (error) {
      console.warn(` No se pudo eliminar archivo temporal: ${filePath}`, error.message);
    }
  }
}

/**
 * Valida datos Base64
 */
validateBase64Image(base64Data) {
  try {
    // Verificar que no esté vacío
    if (!base64Data || typeof base64Data !== 'string') {
      return { isValid: false, error: 'Datos Base64 vacíos o inválidos' };
    }

    // Limpiar y verificar formato
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Verificar que sea Base64 válido
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      return { isValid: false, error: 'Formato Base64 inválido' };
    }

    // Verificar tamaño mínimo (al menos 1KB)
    if (cleanBase64.length < 1000) {
      return { isValid: false, error: 'Imagen demasiado pequeña' };
    }

    // Verificar tamaño máximo (máximo 10MB en Base64)
    const maxSizeBytes = 10 * 1024 * 1024 * (4/3); // Base64 es ~33% más grande
    if (cleanBase64.length > maxSizeBytes) {
      return { isValid: false, error: 'Imagen demasiado grande (máximo 10MB)' };
    }

    return { isValid: true };
    
  } catch (error) {
    return { isValid: false, error: `Error validando Base64: ${error.message}` };
  }
}
}

module.exports = new OCRService();