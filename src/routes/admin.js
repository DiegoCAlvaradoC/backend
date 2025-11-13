/**
 * Rutas de Administración
 * /api/admin/*
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitize, validatePagination } = require('../middleware/validation');

// Todas las rutas requieren autenticación y rol de ADMIN u OPERADOR_ADMISIONES
router.use(authenticate);
router.use(authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]));

// === GESTIÓN DE PERÍODOS ACADÉMICOS ===
router.post('/periodos',
  sanitize,
  asyncHandler(adminController.crearPeriodo)
);

router.get('/periodos',
  validatePagination,
  asyncHandler(adminController.obtenerPeriodos)
);

router.get('/periodos/activo/current',
  asyncHandler(adminController.obtenerPeriodoActivo)
);

router.get('/periodos/:id',
  asyncHandler(adminController.obtenerPeriodoPorId)
);

router.patch('/periodos/:id',
  sanitize,
  asyncHandler(adminController.actualizarPeriodo)
);

router.delete('/periodos/:id',
  asyncHandler(adminController.eliminarPeriodo)
);

// === GESTIÓN DE USUARIOS ===
// Solo ADMIN puede gestionar usuarios
router.get('/usuarios',
  authorize([ROLES.ADMIN]),
  validatePagination,
  asyncHandler(adminController.listarUsuarios)
);

router.post('/usuarios',
  authorize([ROLES.ADMIN]),
  sanitize,
  asyncHandler(adminController.crearUsuarioAdmin)
);

router.patch('/usuarios/:id/rol',
  authorize([ROLES.ADMIN]),
  asyncHandler(adminController.actualizarRol)
);

router.patch('/usuarios/:id/estado',
  authorize([ROLES.ADMIN]),
  asyncHandler(adminController.cambiarEstado)
);

// === LOGS Y AUDITORÍA ===
router.get('/logs',
  validatePagination,
  asyncHandler(adminController.obtenerLogs)
);

// === HEALTH CHECK ===
router.get('/health',
  asyncHandler(adminController.healthCheck)
);

module.exports = router;