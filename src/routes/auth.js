// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Rutas de Autenticación
 * Base path: /api/auth
 */

// ========== RUTAS PÚBLICAS ==========

/**
 * @route   POST /api/auth/register
 * @desc    Registrar un nuevo usuario
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login de usuario
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Renovar access token usando refresh token
 * @access  Public
 */
router.post('/refresh', authController.refreshToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicitar reset de contraseña
 * @access  Public
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Resetear contraseña con token
 * @access  Public
 */
router.post('/reset-password', authController.resetPassword);

/**
 * @route   GET /api/auth/verify
 * @desc    Verificar validez de un token
 * @access  Public
 */
router.get('/verify', authController.verifyToken);

/**
 * @route   GET /api/auth/health
 * @desc    Health check del servicio de autenticación
 * @access  Public
 */
router.get('/health', authController.healthCheck);

// ========== RUTAS PROTEGIDAS ==========

/**
 * @route   POST /api/auth/logout
 * @desc    Logout de usuario
 * @access  Private (requiere autenticación)
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   GET /api/auth/profile
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private
 */
router.get('/profile', authenticate, authController.getProfile);

/**
 * @route   PATCH /api/auth/profile
 * @desc    Actualizar perfil del usuario autenticado
 * @access  Private
 */
router.patch('/profile', authenticate, authController.updateProfile);

/**
 * @route   POST /api/auth/change-password
 * @desc    Cambiar contraseña del usuario autenticado
 * @access  Private
 */
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;