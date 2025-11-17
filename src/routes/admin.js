/**
 * Rutas de Administración
 * /routes/admin/*
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize, ROLES } = require('../middleware/auth');

// Middleware helper para manejar errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Todas las rutas requieren autenticación
router.use(authenticate);

// === GESTIÓN DE PERÍODOS ACADÉMICOS ===
// Requiere rol ADMIN o OPERADOR_ADMISIONES
router.post('/periodos',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.crearPeriodo)
);

router.get('/periodos',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.obtenerPeriodos)
);

router.get('/periodos/activo/current',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.obtenerPeriodoActivo)
);

router.get('/periodos/:id',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.obtenerPeriodoPorId)
);

router.patch('/periodos/:id',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.actualizarPeriodo)
);

router.delete('/periodos/:id',
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.eliminarPeriodo)
);

// === GESTIÓN DE USUARIOS ===
// Solo ADMIN puede gestionar usuarios
router.get('/usuarios',
    authorize([ROLES.ADMIN]),
    asyncHandler(adminController.listarUsuarios)
);

router.post('/usuarios',
    authorize([ROLES.ADMIN]),
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
    authorize([ROLES.ADMIN, ROLES.OPERADOR_ADMISIONES]),
    asyncHandler(adminController.obtenerLogs)
);

// === HEALTH CHECK ===
router.get('/health',
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            message: 'Módulo de administración operativo',
            timestamp: new Date().toISOString()
        });
    })
);

module.exports = router;