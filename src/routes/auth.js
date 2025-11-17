/**
 * Rutas de Autenticación
 * /routes/auth/*
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, refreshAccessToken } = require('../middleware/auth');

// Middleware helper para manejar errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// === RUTAS PÚBLICAS (no requieren autenticación) ===

router.post('/register',
    asyncHandler(authController.register)
);

router.post('/login',
    asyncHandler(authController.login)
);

router.post('/refresh',
    asyncHandler(refreshAccessToken)
);

// === RUTAS PROTEGIDAS (requieren autenticación) ===

router.post('/logout',
    authenticate,
    asyncHandler(authController.logout)
);

router.get('/profile',
    authenticate,
    asyncHandler(authController.getProfile)
);

router.patch('/profile',
    authenticate,
    asyncHandler(authController.updateProfile)
);

router.post('/change-password',
    authenticate,
    asyncHandler(authController.changePassword)
);

// === HEALTH CHECK ===
router.get('/health',
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            message: 'Módulo de autenticación operativo',
            timestamp: new Date().toISOString()
        });
    })
);

module.exports = router;