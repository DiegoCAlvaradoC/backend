/** ../services/prediccionService.js */

const pool = require('../config/database');

/**
 * Clase de Regresión Lineal Simple
 * y = mx + b
 */
class RegresionLineal {
  constructor() {
    this.m = 0; // Pendiente
    this.b = 0; // Intercepto
    this.r2 = 0; // Coeficiente de determinación
  }

  /**
   * Entrena el modelo con datos históricos
   */
  entrenar(x, y) {
    if (x.length !== y.length || x.length < 2) {
      throw new Error('Datos insuficientes para entrenamiento');
    }

    const n = x.length;
    const mediaX = x.reduce((a, b) => a + b, 0) / n;
    const mediaY = y.reduce((a, b) => a + b, 0) / n;

    let numerador = 0;
    let denominador = 0;

    for (let i = 0; i < n; i++) {
      numerador += (x[i] - mediaX) * (y[i] - mediaY);
      denominador += Math.pow(x[i] - mediaX, 2);
    }

    this.m = numerador / denominador;
    this.b = mediaY - this.m * mediaX;

    // Calcular R²
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const prediccion = this.predecir(x[i]);
      ssRes += Math.pow(y[i] - prediccion, 2);
      ssTot += Math.pow(y[i] - mediaY, 2);
    }

    this.r2 = 1 - (ssRes / ssTot);
  }

  predecir(x) {
    return this.m * x + this.b;
  }

  getParametros() {
    return {
      pendiente: this.m,
      intercepto: this.b,
      r2: this.r2,
      bondadAjuste: this.interpretarR2()
    };
  }

  interpretarR2() {
    if (this.r2 >= 0.9) return 'Excelente';
    if (this.r2 >= 0.7) return 'Bueno';
    if (this.r2 >= 0.5) return 'Moderado';
    if (this.r2 >= 0.3) return 'Bajo';
    return 'Muy Bajo';
  }
}

/**
 * Servicio de Predicción
 */
class PrediccionService {

  /**
   * Obtiene datos históricos para entrenamiento
   */
  async obtenerDatosHistoricos(periodos = 5) {
    try {
      const query = `
        SELECT 
          pa.id,
          pa.nombre,
          pa.fecha_inicio,
          pa.fecha_fin,
          COUNT(p.id) as total_preinscripciones,
          COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas,
          COUNT(CASE WHEN p.estado = 'RECHAZADA' THEN 1 END) as rechazadas
        FROM admisiones.periodos_academicos pa
        LEFT JOIN admisiones.preinscripciones p ON pa.id = p.periodo_id
        WHERE pa.fecha_fin < CURRENT_DATE
        GROUP BY pa.id, pa.nombre, pa.fecha_inicio, pa.fecha_fin
        ORDER BY pa.fecha_inicio DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [periodos]);
      return result.rows;

    } catch (error) {
      console.error('Error obteniendo datos históricos:', error);
      throw error;
    }
  }

  /**
   * Predice inscripciones para el siguiente período
   */
  async predecirInscripciones() {
    try {
      const datosHistoricos = await this.obtenerDatosHistoricos(10);

      if (datosHistoricos.length < 3) {
        return {
          error: 'Datos insuficientes',
          mensaje: 'Se requieren al menos 3 períodos históricos para predicción',
          datosDisponibles: datosHistoricos.length
        };
      }

      // Preparar datos
      const x = datosHistoricos.map((_, index) => index + 1).reverse();
      const y = datosHistoricos.map(p => parseInt(p.total_preinscripciones)).reverse();

      // Entrenar modelo
      const modelo = new RegresionLineal();
      modelo.entrenar(x, y);

      // Predecir
      const siguientePeriodo = x.length + 1;
      const prediccion = Math.round(modelo.predecir(siguientePeriodo));

      // Intervalo de confianza
      const desviacionEstandar = this.calcularDesviacionEstandar(y);
      const margenError = 1.96 * desviacionEstandar;

      return {
        prediccion,
        intervaloConfianza: {
          minimo: Math.max(0, Math.round(prediccion - margenError)),
          maximo: Math.round(prediccion + margenError)
        },
        modelo: modelo.getParametros(),
        datosHistoricos: datosHistoricos.reverse(),
        analisis: {
          tendencia: modelo.m > 0 ? 'Creciente' : modelo.m < 0 ? 'Decreciente' : 'Estable',
          tasaCrecimiento: ((modelo.m / (y.reduce((a, b) => a + b, 0) / y.length)) * 100).toFixed(2) + '%',
          confiabilidad: modelo.interpretarR2()
        }
      };

    } catch (error) {
      console.error('Error prediciendo inscripciones:', error);
      throw error;
    }
  }

  /**
   * Predice inscripciones por carrera
   */
  async predecirPorCarrera(carrera) {
    try {
      const query = `
        SELECT 
          pa.nombre as periodo,
          COUNT(p.id) as total
        FROM admisiones.periodos_academicos pa
        LEFT JOIN admisiones.preinscripciones p 
          ON pa.id = p.periodo_id 
          AND p.carrera_interes = $1
        WHERE pa.fecha_fin < CURRENT_DATE
        GROUP BY pa.id, pa.nombre, pa.fecha_inicio
        ORDER BY pa.fecha_inicio DESC
        LIMIT 6
      `;

      const result = await pool.query(query, [carrera]);

      if (result.rows.length < 3) {
        return {
          error: 'Datos insuficientes',
          carrera,
          datosDisponibles: result.rows.length
        };
      }

      const x = result.rows.map((_, index) => index + 1).reverse();
      const y = result.rows.map(p => parseInt(p.total)).reverse();

      const modelo = new RegresionLineal();
      modelo.entrenar(x, y);

      const prediccion = Math.round(modelo.predecir(x.length + 1));

      return {
        carrera,
        prediccion: Math.max(0, prediccion),
        modelo: modelo.getParametros(),
        historico: result.rows.reverse()
      };

    } catch (error) {
      console.error('Error prediciendo por carrera:', error);
      throw error;
    }
  }

  /**
   * Calcula scoring de postulante
   */
  async calcularScoring(preinscripcionId) {
    try {
      const query = `
        SELECT 
          p.*,
          pos.fecha_nacimiento,
          (p.datos_ocr->>'averageConfidence')::numeric as confianza_ocr,
          (p.datos_ocr->'validation'->>'completeness')::numeric as completitud_datos
        FROM admisiones.preinscripciones p
        JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
        WHERE p.id = $1
      `;

      const result = await pool.query(query, [preinscripcionId]);

      if (result.rows.length === 0) {
        throw new Error('Preinscripción no encontrada');
      }

      const preinscripcion = result.rows[0];

      let puntaje = 0;
      const factores = [];

      // 1. Calidad de OCR (0-25 puntos)
      const confianzaOCR = preinscripcion.confianza_ocr || 0;
      const puntajeOCR = Math.min(25, (confianzaOCR / 100) * 25);
      puntaje += puntajeOCR;
      factores.push({
        factor: 'Calidad OCR',
        puntaje: puntajeOCR.toFixed(2),
        maxPuntaje: 25,
        descripcion: `Confianza del OCR: ${confianzaOCR}%`
      });

      // 2. Completitud de datos (0-25 puntos)
      const completitud = preinscripcion.completitud_datos || 0;
      const puntajeCompletitud = Math.min(25, (completitud / 100) * 25);
      puntaje += puntajeCompletitud;
      factores.push({
        factor: 'Completitud de Datos',
        puntaje: puntajeCompletitud.toFixed(2),
        maxPuntaje: 25,
        descripcion: `Datos completos: ${completitud}%`
      });

      // 3. Tiempo de respuesta (0-20 puntos)
      const tiempoRespuesta = (new Date() - new Date(preinscripcion.fecha_creacion)) / (1000 * 60 * 60 * 24);
      const puntajeTiempo = Math.max(0, 20 - (tiempoRespuesta * 2));
      puntaje += puntajeTiempo;
      factores.push({
        factor: 'Prontitud',
        puntaje: puntajeTiempo.toFixed(2),
        maxPuntaje: 20,
        descripcion: `Días desde solicitud: ${tiempoRespuesta.toFixed(1)}`
      });

      // 4. Edad apropiada (0-15 puntos)
      if (preinscripcion.fecha_nacimiento) {
        const edad = this.calcularEdad(preinscripcion.fecha_nacimiento);
        let puntajeEdad = 0;
        
        if (edad >= 17 && edad <= 25) puntajeEdad = 15;
        else if (edad >= 16 && edad <= 30) puntajeEdad = 10;
        else puntajeEdad = 5;
        
        puntaje += puntajeEdad;
        factores.push({
          factor: 'Edad',
          puntaje: puntajeEdad.toFixed(2),
          maxPuntaje: 15,
          descripcion: `Edad: ${edad} años`
        });
      }

      // 5. Documentación (0-15 puntos)
      const documentosQuery = await pool.query(
        'SELECT COUNT(*) as total FROM admisiones.documentos WHERE preinscripcion_id = $1',
        [preinscripcionId]
      );
      
      const totalDocumentos = parseInt(documentosQuery.rows[0].total);
      const puntajeDocumentos = Math.min(15, totalDocumentos * 5);
      puntaje += puntajeDocumentos;
      
      factores.push({
        factor: 'Documentación',
        puntaje: puntajeDocumentos.toFixed(2),
        maxPuntaje: 15,
        descripcion: `Documentos subidos: ${totalDocumentos}`
      });

      const puntajeFinal = puntaje;
      
      // Clasificación
      let clasificacion, recomendacion;
      
      if (puntajeFinal >= 80) {
        clasificacion = 'Excelente';
        recomendacion = 'Altamente recomendado para aprobación';
      } else if (puntajeFinal >= 60) {
        clasificacion = 'Bueno';
        recomendacion = 'Recomendado para aprobación';
      } else if (puntajeFinal >= 40) {
        clasificacion = 'Regular';
        recomendacion = 'Requiere revisión adicional';
      } else {
        clasificacion = 'Bajo';
        recomendacion = 'Requiere atención especial';
      }

      return {
        preinscripcionId,
        puntajeFinal: puntajeFinal.toFixed(2),
        clasificacion,
        recomendacion,
        factores,
        calculadoEn: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error calculando scoring:', error);
      throw error;
    }
  }

  /**
   * Predice probabilidad de deserción
   */
  async predecirDesercion(postulanteId) {
    try {
      const query = `
        SELECT 
          p.*,
          pos.fecha_nacimiento,
          pos.lugar_nacimiento,
          (SELECT COUNT(*) FROM admisiones.documentos WHERE preinscripcion_id = p.id) as documentos_count
        FROM admisiones.preinscripciones p
        JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
        WHERE pos.id = $1
        ORDER BY p.fecha_creacion DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [postulanteId]);

      if (result.rows.length === 0) {
        throw new Error('Postulante no encontrado');
      }

      const data = result.rows[0];
      
      let riesgo = 0;
      const factores = [];

      // 1. Edad
      if (data.fecha_nacimiento) {
        const edad = this.calcularEdad(data.fecha_nacimiento);
        let riesgoEdad = 0;
        
        if (edad < 18) riesgoEdad = 30;
        else if (edad <= 22) riesgoEdad = 10;
        else if (edad <= 28) riesgoEdad = 20;
        else riesgoEdad = 40;
        
        riesgo += riesgoEdad;
        factores.push({
          factor: 'Edad',
          riesgo: riesgoEdad,
          descripcion: `${edad} años`
        });
      }

      // 2. Documentación
      const docCount = data.documentos_count || 0;
      const riesgoDoc = docCount >= 3 ? 10 : 40 - (docCount * 10);
      riesgo += riesgoDoc;
      factores.push({
        factor: 'Documentación',
        riesgo: riesgoDoc,
        descripcion: `${docCount} documentos`
      });

      // 3. Tiempo de respuesta
      if (data.fecha_creacion) {
        const dias = (new Date() - new Date(data.fecha_creacion)) / (1000 * 60 * 60 * 24);
        const riesgoTiempo = Math.min(30, dias * 2);
        riesgo += riesgoTiempo;
        factores.push({
          factor: 'Demora',
          riesgo: riesgoTiempo.toFixed(2),
          descripcion: `${dias.toFixed(1)} días`
        });
      }

      const riesgoFinal = Math.min(100, riesgo);
      
      let clasificacion, recomendacion;
      
      if (riesgoFinal >= 70) {
        clasificacion = 'Alto Riesgo';
        recomendacion = 'Requiere seguimiento inmediato';
      } else if (riesgoFinal >= 40) {
        clasificacion = 'Riesgo Moderado';
        recomendacion = 'Monitoreo regular';
      } else {
        clasificacion = 'Bajo Riesgo';
        recomendacion = 'Seguimiento estándar';
      }

      return {
        postulanteId,
        riesgoDesercion: riesgoFinal.toFixed(2),
        probabilidadRetencion: (100 - riesgoFinal).toFixed(2),
        clasificacion,
        recomendacion,
        factores,
        calculadoEn: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error prediciendo deserción:', error);
      throw error;
    }
  }

  /**
   * Calcula edad
   */
  calcularEdad(fechaNacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    
    return edad;
  }

  /**
   * Calcula desviación estándar
   */
  calcularDesviacionEstandar(valores) {
    const n = valores.length;
    const media = valores.reduce((a, b) => a + b, 0) / n;
    const varianza = valores.reduce((sum, val) => sum + Math.pow(val - media, 2), 0) / n;
    return Math.sqrt(varianza);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM admisiones.preinscripciones');
      
      return {
        status: 'healthy',
        service: 'PrediccionService',
        timestamp: new Date().toISOString(),
        totalDatos: parseInt(result.rows[0].count)
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'PrediccionService',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = new PrediccionService();