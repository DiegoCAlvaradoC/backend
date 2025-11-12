// services/reportService.js

const { pool } = require('../config/database');

/**
 * Obtiene estadísticas generales del sistema
 */
const getEstadisticasGenerales = async (periodoId = null) => {
  try {
    let whereClause = periodoId ? 'WHERE p.periodo_id = $1' : '';
    let params = periodoId ? [periodoId] : [];

    const query = `
      SELECT 
        COUNT(*) as total_preinscripciones,
        COUNT(CASE WHEN estado = 'PENDIENTE' THEN 1 END) as pendientes,
        COUNT(CASE WHEN estado = 'EN_REVISION' THEN 1 END) as en_revision,
        COUNT(CASE WHEN estado = 'APROBADA' THEN 1 END) as aprobadas,
        COUNT(CASE WHEN estado = 'RECHAZADA' THEN 1 END) as rechazadas,
        COUNT(CASE WHEN estado = 'DOCUMENTACION_INCOMPLETA' THEN 1 END) as doc_incompleta,
        ROUND(AVG(CASE WHEN datos_ocr->>'averageConfidence' IS NOT NULL 
          THEN (datos_ocr->>'averageConfidence')::numeric 
          ELSE NULL END), 2) as confianza_ocr_promedio,
        COUNT(DISTINCT postulante_id) as postulantes_unicos
      FROM admisiones.preinscripciones p
      ${whereClause}
    `;

    const result = await pool.query(query, params);
    
    return {
      ...result.rows[0],
      tasa_aprobacion: result.rows[0].aprobadas / result.rows[0].total_preinscripciones * 100 || 0,
      tasa_rechazo: result.rows[0].rechazadas / result.rows[0].total_preinscripciones * 100 || 0
    };

  } catch (error) {
    console.error('Error obteniendo estadísticas generales:', error);
    throw error;
  }
};

/**
 * Obtiene distribución por carrera
 */
const getDistribucionPorCarrera = async (periodoId = null) => {
  try {
    let whereClause = periodoId ? 'WHERE periodo_id = $1' : '';
    let params = periodoId ? [periodoId] : [];

    const query = `
      SELECT 
        carrera_interes as carrera,
        COUNT(*) as cantidad,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM admisiones.preinscripciones ${whereClause})::numeric * 100, 2) as porcentaje,
        COUNT(CASE WHEN estado = 'APROBADA' THEN 1 END) as aprobadas,
        COUNT(CASE WHEN estado = 'RECHAZADA' THEN 1 END) as rechazadas
      FROM admisiones.preinscripciones
      ${whereClause}
      GROUP BY carrera_interes
      ORDER BY cantidad DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('Error obteniendo distribución por carrera:', error);
    throw error;
  }
};

/**
 * Obtiene tendencia temporal de preinscripciones
 */
const getTendenciaTemporal = async (periodoId, granularidad = 'day') => {
  try {
    let dateFormat;
    switch(granularidad) {
      case 'hour':
        dateFormat = 'YYYY-MM-DD HH24:00';
        break;
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const query = `
      SELECT 
        TO_CHAR(fecha_creacion, '${dateFormat}') as periodo,
        COUNT(*) as cantidad,
        COUNT(CASE WHEN estado = 'APROBADA' THEN 1 END) as aprobadas
      FROM admisiones.preinscripciones
      WHERE periodo_id = $1
      GROUP BY TO_CHAR(fecha_creacion, '${dateFormat}')
      ORDER BY periodo
    `;

    const result = await pool.query(query, [periodoId]);
    return result.rows;

  } catch (error) {
    console.error('Error obteniendo tendencia temporal:', error);
    throw error;
  }
};

/**
 * Obtiene métricas de calidad OCR
 */
const getMetricasOCR = async (periodoId = null) => {
  try {
    let whereClause = periodoId ? 'WHERE periodo_id = $1' : '';
    let params = periodoId ? [periodoId] : [];

    const query = `
      SELECT 
        COUNT(*) as total_procesados,
        ROUND(AVG((datos_ocr->>'averageConfidence')::numeric), 2) as confianza_promedio,
        MIN((datos_ocr->>'averageConfidence')::numeric) as confianza_minima,
        MAX((datos_ocr->>'averageConfidence')::numeric) as confianza_maxima,
        COUNT(CASE WHEN (datos_ocr->>'averageConfidence')::numeric >= 80 THEN 1 END) as alta_confianza,
        COUNT(CASE WHEN (datos_ocr->>'averageConfidence')::numeric < 60 THEN 1 END) as baja_confianza,
        ROUND(COUNT(CASE WHEN (datos_ocr->'validation'->>'isValid')::boolean = true THEN 1 END)::numeric / 
              COUNT(*)::numeric * 100, 2) as porcentaje_validos
      FROM admisiones.preinscripciones
      ${whereClause}
      AND datos_ocr IS NOT NULL
    `;

    const result = await pool.query(query, params);
    return result.rows[0];

  } catch (error) {
    console.error('Error obteniendo métricas OCR:', error);
    throw error;
  }
};

/**
 * Obtiene distribución demográfica
 */
const getDistribucionDemografica = async (periodoId = null) => {
  try {
    let whereClause = periodoId ? 'WHERE p.periodo_id = $1' : '';
    let params = periodoId ? [periodoId] : [];

    // Distribución por edad
    const edadQuery = `
      SELECT 
        CASE 
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, pos.fecha_nacimiento)) < 18 THEN 'Menor de 18'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, pos.fecha_nacimiento)) BETWEEN 18 AND 20 THEN '18-20'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, pos.fecha_nacimiento)) BETWEEN 21 AND 25 THEN '21-25'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, pos.fecha_nacimiento)) > 25 THEN 'Mayor de 25'
          ELSE 'Sin datos'
        END as rango_edad,
        COUNT(*) as cantidad
      FROM admisiones.preinscripciones p
      JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
      ${whereClause}
      GROUP BY rango_edad
      ORDER BY rango_edad
    `;

    // Distribución por género
    const generoQuery = `
      SELECT 
        COALESCE(pos.genero, 'Sin especificar') as genero,
        COUNT(*) as cantidad,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM admisiones.preinscripciones ${whereClause})::numeric * 100, 2) as porcentaje
      FROM admisiones.preinscripciones p
      JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
      ${whereClause}
      GROUP BY pos.genero
      ORDER BY cantidad DESC
    `;

    // Distribución por departamento
    const departamentoQuery = `
      SELECT 
        pos.lugar_nacimiento as departamento,
        COUNT(*) as cantidad
      FROM admisiones.preinscripciones p
      JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
      ${whereClause}
      AND pos.lugar_nacimiento IS NOT NULL
      GROUP BY pos.lugar_nacimiento
      ORDER BY cantidad DESC
      LIMIT 10
    `;

    const [edad, genero, departamento] = await Promise.all([
      pool.query(edadQuery, params),
      pool.query(generoQuery, params),
      pool.query(departamentoQuery, params)
    ]);

    return {
      porEdad: edad.rows,
      porGenero: genero.rows,
      porDepartamento: departamento.rows
    };

  } catch (error) {
    console.error('Error obteniendo distribución demográfica:', error);
    throw error;
  }
};

/**
 * Obtiene métricas de rendimiento del sistema
 */
const getMetricasRendimiento = async (periodoId = null) => {
  try {
    let whereClause = periodoId ? 'WHERE periodo_id = $1' : '';
    let params = periodoId ? [periodoId] : [];

    const query = `
      SELECT 
        ROUND(AVG(EXTRACT(EPOCH FROM (fecha_actualizacion - fecha_creacion)) / 60), 2) as tiempo_promedio_procesamiento_min,
        ROUND(MIN(EXTRACT(EPOCH FROM (fecha_actualizacion - fecha_creacion)) / 60), 2) as tiempo_min_procesamiento_min,
        ROUND(MAX(EXTRACT(EPOCH FROM (fecha_actualizacion - fecha_creacion)) / 60), 2) as tiempo_max_procesamiento_min,
        COUNT(CASE WHEN requiere_atencion = true THEN 1 END) as casos_requieren_atencion,
        COUNT(CASE WHEN estado = 'DOCUMENTACION_INCOMPLETA' THEN 1 END) as documentacion_incompleta
      FROM admisiones.preinscripciones
      ${whereClause}
      AND fecha_actualizacion IS NOT NULL
    `;

    const result = await pool.query(query, params);
    return result.rows[0];

  } catch (error) {
    console.error('Error obteniendo métricas de rendimiento:', error);
    throw error;
  }
};

/**
 * Genera reporte completo consolidado
 */
const generarReporteCompleto = async (periodoId) => {
  try {
    const [
      estadisticas,
      distribucionCarrera,
      tendencia,
      metricasOCR,
      demografia,
      rendimiento
    ] = await Promise.all([
      getEstadisticasGenerales(periodoId),
      getDistribucionPorCarrera(periodoId),
      getTendenciaTemporal(periodoId, 'day'),
      getMetricasOCR(periodoId),
      getDistribucionDemografica(periodoId),
      getMetricasRendimiento(periodoId)
    ]);

    // Información del período
    let periodo = null;
    if (periodoId) {
      const periodoResult = await pool.query(
        'SELECT * FROM admisiones.periodos_academicos WHERE id = $1',
        [periodoId]
      );
      periodo = periodoResult.rows[0];
    }

    return {
      periodo,
      generado_en: new Date().toISOString(),
      estadisticas_generales: estadisticas,
      distribucion_por_carrera: distribucionCarrera,
      tendencia_temporal: tendencia,
      metricas_ocr: metricasOCR,
      demografia,
      rendimiento
    };

  } catch (error) {
    console.error('Error generando reporte completo:', error);
    throw error;
  }
};

/**
 * Exporta datos en formato CSV
 */
const exportarCSV = async (periodoId, campos = []) => {
  try {
    const camposDefault = [
      'p.codigo_seguimiento',
      'pos.ci',
      'pos.nombres',
      'pos.apellidos',
      'p.carrera_interes',
      'p.estado',
      'p.fecha_creacion'
    ];

    const camposSeleccion = campos.length > 0 ? campos : camposDefault;

    const query = `
      SELECT ${camposSeleccion.join(', ')}
      FROM admisiones.preinscripciones p
      JOIN admisiones.postulantes pos ON p.postulante_id = pos.id
      WHERE p.periodo_id = $1
      ORDER BY p.fecha_creacion DESC
    `;

    const result = await pool.query(query, [periodoId]);

    // Convertir a CSV
    if (result.rows.length === 0) {
      return '';
    }

    const headers = Object.keys(result.rows[0]).join(',');
    const rows = result.rows.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );

    return [headers, ...rows].join('\n');

  } catch (error) {
    console.error('Error exportando CSV:', error);
    throw error;
  }
};

/**
 * Health check del servicio
 */
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM admisiones.preinscripciones');
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      totalPreinscripciones: parseInt(result.rows[0].count)
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

module.exports = {
  getEstadisticasGenerales,
  getDistribucionPorCarrera,
  getTendenciaTemporal,
  getMetricasOCR,
  getDistribucionDemografica,
  getMetricasRendimiento,
  generarReporteCompleto,
  exportarCSV,
  healthCheck
};