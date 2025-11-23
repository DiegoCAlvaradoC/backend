// routes/periods.js
/**
 * Rutas para Gestión de Períodos de Inscripción
 */

const express = require('express');
const router = express.Router();
const periodsController = require('../controllers/periodsController');

// =============================================
// RUTAS DE PERÍODOS DE INSCRIPCIÓN
// =============================================

/**
 * @route   POST /api/admin/periodos
 * @desc    Crear nuevo período de inscripción
 * @access  Admin
 */
router.post('/periodos', periodsController.crearPeriodo);

/**
 * @route   GET /api/admin/periodos
 * @desc    Obtener todos los períodos
 * @query   ?estado=true&limit=20&offset=0
 * @access  Admin
 */
router.get('/periodos', periodsController.obtenerPeriodos);

/**
 * @route   GET /api/admin/periodos/activo/current
 * @desc    Obtener el período activo actual
 * @access  Public
 */
router.get('/periodos/activo/current', periodsController.obtenerPeriodoActivo);

/**
 * @route   GET /api/admin/periodos/:id
 * @desc    Obtener un período específico por ID
 * @access  Admin
 */
router.get('/periodos/:id', periodsController.obtenerPeriodoPorId);

/**
 * @route   PATCH /api/admin/periodos/:id
 * @desc    Actualizar un período
 * @access  Admin
 */
router.patch('/periodos/:id', periodsController.actualizarPeriodo);

/**
 * @route   DELETE /api/admin/periodos/:id
 * @desc    Eliminar un período
 * @access  Admin
 */
router.delete('/periodos/:id', periodsController.eliminarPeriodo);

/**
 * @route   GET /api/admin/health
 * @desc    Health check del módulo de administración
 * @access  Public
 */
router.get('/health', periodsController.healthCheck);

module.exports = router;