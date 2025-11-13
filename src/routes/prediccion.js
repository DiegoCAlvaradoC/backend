/**
 * Rutas de Predicción ML
 * /api/prediccion/*
 */

const express = require('express');
const router = express.Router();
const prediccionController = require('../controllers/prediccionController');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Solo ADMIN y OPERADOR_ADMISIONES pueden acceder a predicciones
router.use(authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]));

router.post('/inscripciones',
  asyncHandler(prediccionController.predecirInscripciones)
);

router.post('/carrera',
  asyncHandler(prediccionController.predecirPorCarrera)
);

router.get('/scoring/:preinscripcion_id',
  asyncHandler(prediccionController.calcularScoring)
);

router.get('/desercion/:postulante_id',
  asyncHandler(prediccionController.predecirDesercion)
);

router.get('/health',
  asyncHandler(prediccionController.healthCheck)
);

module.exports = router;