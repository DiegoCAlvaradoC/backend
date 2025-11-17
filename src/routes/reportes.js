/**
 * Rutas de Reportes y Analítica
 * /api/reportes/*
 */

const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reportController');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Solo ADMIN y OPERADOR_ADMISIONES pueden acceder a reportes
router.use(authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES, ROLES.REVISOR]));

router.get('/estadisticas',
  asyncHandler(reporteController.getEstadisticas)
);

router.get('/distribucion-carreras',
  asyncHandler(reporteController.getDistribucionCarreras)
);

router.get('/tendencia',
  asyncHandler(reporteController.getTendencia)
);

router.get('/metricas-ocr',
  asyncHandler(reporteController.getMetricasOCR)
);

router.get('/demografia',
  asyncHandler(reporteController.getDemografia)
);

router.get('/rendimiento',
  asyncHandler(reporteController.getRendimiento)
);

router.get('/completo',
  asyncHandler(reporteController.getReporteCompleto)
);

router.get('/exportar-csv',
  asyncHandler(reporteController.exportarCSV)
);

router.get('/health',
  asyncHandler(reporteController.healthCheck)
);

module.exports = router;