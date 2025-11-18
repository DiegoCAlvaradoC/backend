// routes/prediccion.js
const express = require('express');
const router = express.Router();
const prediccionController = require('../controllers/prediccionController');

/**
 * Rutas de Predicción ML
 */

// Obtener datos históricos
router.get('/datos-historicos', prediccionController.obtenerDatosHistoricos);

// Generar predicción
router.post('/inscripciones', prediccionController.predecirInscripciones);

// Obtener historial de predicciones
router.get('/historial', prediccionController.obtenerHistorial);

// Exportar predicción a PDF
router.post('/exportar/pdf', prediccionController.exportarPDF);

// Exportar predicción a Excel
router.post('/exportar/excel', prediccionController.exportarExcel);

// Predecir por carrera específica
router.post('/carrera', prediccionController.predecirPorCarrera);

// Calcular scoring de postulante
router.get('/scoring/:preinscripcion_id', prediccionController.calcularScoring);

// Health check
router.get('/health', prediccionController.healthCheck);

module.exports = router;