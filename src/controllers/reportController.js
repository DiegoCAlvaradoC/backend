/**
 * ReporteController - Controlador de Reportes
 * Sistema de Admisiones UCB
 */

const reporteService = require('../services/reporteService');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/reportes/estadisticas
 * Obtiene estadísticas generales
 */
const getEstadisticas = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    const estadisticas = await reporteService.getEstadisticasGenerales(periodo_id);

    res.json({
      success: true,
      data: estadisticas
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/distribucion-carreras
 * Obtiene distribución por carrera
 */
const getDistribucionCarreras = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    const distribucion = await reporteService.getDistribucionPorCarrera(periodo_id);

    res.json({
      success: true,
      data: distribucion
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/tendencia
 * Obtiene tendencia temporal
 */
const getTendencia = async (req, res, next) => {
  try {
    const { periodo_id, granularidad = 'day' } = req.query;

    if (!periodo_id) {
      throw new AppError('Se requiere periodo_id', 400, 'PERIODO_REQUIRED');
    }

    const tendencia = await reporteService.getTendenciaTemporal(periodo_id, granularidad);

    res.json({
      success: true,
      data: tendencia,
      meta: { granularidad }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/metricas-ocr
 * Obtiene métricas de OCR
 */
const getMetricasOCR = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    const metricas = await reporteService.getMetricasOCR(periodo_id);

    res.json({
      success: true,
      data: metricas
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/demografia
 * Obtiene distribución demográfica
 */
const getDemografia = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    const demografia = await reporteService.getDistribucionDemografica(periodo_id);

    res.json({
      success: true,
      data: demografia
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/rendimiento
 * Obtiene métricas de rendimiento
 */
const getRendimiento = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    const rendimiento = await reporteService.getMetricasRendimiento(periodo_id);

    res.json({
      success: true,
      data: rendimiento
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/completo
 * Genera reporte completo consolidado
 */
const getReporteCompleto = async (req, res, next) => {
  try {
    const { periodo_id } = req.query;

    if (!periodo_id) {
      throw new AppError('Se requiere periodo_id para reporte completo', 400, 'PERIODO_REQUIRED');
    }

    const reporte = await reporteService.generarReporteCompleto(periodo_id);

    res.json({
      success: true,
      data: reporte
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/exportar-csv
 * Exporta datos en formato CSV
 */
const exportarCSV = async (req, res, next) => {
  try {
    const { periodo_id, campos } = req.query;

    if (!periodo_id) {
      throw new AppError('Se requiere periodo_id', 400, 'PERIODO_REQUIRED');
    }

    const camposArray = campos ? campos.split(',') : [];
    const csv = await reporteService.exportarCSV(periodo_id, camposArray);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=preinscripciones_${periodo_id}_${Date.now()}.csv`);
    res.send(csv);

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/health
 * Health check del servicio
 */
const healthCheck = async (req, res, next) => {
  try {
    const health = await reporteService.healthCheck();

    res.json({
      success: true,
      ...health
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEstadisticas,
  getDistribucionCarreras,
  getTendencia,
  getMetricasOCR,
  getDemografia,
  getRendimiento,
  getReporteCompleto,
  exportarCSV,
  healthCheck
};