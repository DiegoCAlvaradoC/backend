// routes/preinscripciones.js
const express = require('express');
const { body, param, query } = require('express-validator');
const preinscripcionController = require('../controllers/preinscripcionController');

const router = express.Router();

/**
 * Validaciones para crear preinscripción
 */
const validarCrearPreinscripcion = [
    // Datos básicos del postulante
    body('nombre')
        .notEmpty()
        .withMessage('El nombre es obligatorio')
        .isLength({ min: 2, max: 200 })
        .withMessage('El nombre debe tener entre 2 y 200 caracteres')
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
        .withMessage('El nombre solo puede contener letras y espacios'),

    body('ci')
        .notEmpty()
        .withMessage('El CI es obligatorio')
        .isLength({ min: 6, max: 20 })
        .withMessage('El CI debe tener entre 6 y 20 caracteres')
        .matches(/^[0-9]+$/)
        .withMessage('El CI solo puede contener números'),

    body('celular')
        .optional()
        .isMobilePhone('es-BO')
        .withMessage('Formato de celular inválido para Bolivia'),

    body('email')
        .optional()
        .isEmail()
        .withMessage('Formato de email inválido')
        .normalizeEmail(),

    // Validaciones opcionales
    body('nacionalidad')
        .optional()
        .isLength({ max: 100 })
        .withMessage('La nacionalidad no puede exceder 100 caracteres'),

    body('ciudad_procedencia')
        .optional()
        .isLength({ max: 100 })
        .withMessage('La ciudad de procedencia no puede exceder 100 caracteres'),

    body('colegio_egreso')
        .optional()
        .isLength({ max: 200 })
        .withMessage('El nombre del colegio no puede exceder 200 caracteres'),

    body('carrera_interes')
        .optional()
        .isLength({ max: 200 })
        .withMessage('La carrera de interés no puede exceder 200 caracteres'),

    body('anio_egreso')
        .optional()
        .isInt({ min: 1980, max: new Date().getFullYear() + 1 })
        .withMessage('Año de egreso inválido'),

    // Validar contactos si existen
    body('contactos')
        .optional()
        .isArray({ max: 4 })
        .withMessage('Máximo 4 contactos permitidos'),

    body('contactos.*.nombre')
        .if(body('contactos').exists())
        .notEmpty()
        .withMessage('El nombre del contacto es obligatorio')
        .isLength({ max: 200 })
        .withMessage('El nombre del contacto no puede exceder 200 caracteres'),

    body('contactos.*.telefono')
        .if(body('contactos').exists())
        .notEmpty()
        .withMessage('El teléfono del contacto es obligatorio')
        .isLength({ max: 20 })
        .withMessage('El teléfono no puede exceder 20 caracteres'),

    body('contactos.*.parentesco')
        .if(body('contactos').exists())
        .optional()
        .isLength({ max: 50 })
        .withMessage('El parentesco no puede exceder 50 caracteres'),

    // Validar datos del OCR si existen
    body('datosOCR.completeData.ci')
        .if(body('datosOCR').exists())
        .optional()
        .equals(body('ci').value)
        .withMessage('El CI del OCR debe coincidir con el CI proporcionado'),

    body('datosOCR.averageConfidence')
        .if(body('datosOCR').exists())
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('La confianza del OCR debe estar entre 0 y 100')
];

/**
 * Validaciones para consultar por CI
 */
const validarConsultarCI = [
    param('ci')
        .notEmpty()
        .withMessage('El CI es obligatorio')
        .isLength({ min: 6, max: 20 })
        .withMessage('El CI debe tener entre 6 y 20 caracteres')
        .matches(/^[0-9]+$/)
        .withMessage('El CI solo puede contener números')
];

/**
 * Validaciones para obtener por ID
 */
const validarObtenerPorId = [
    param('id')
        .notEmpty()
        .withMessage('El ID es obligatorio')
        .isUUID()
        .withMessage('El ID debe ser un UUID válido')
];

/**
 * Validaciones para listar con filtros
 */
const validarListar = [
    query('estado')
        .optional()
        .isIn(['PENDIENTE', 'VALIDADO', 'OBSERVADO', 'RECHAZADO', 'APROBADO'])
        .withMessage('Estado inválido'),

    query('fecha_desde')
        .optional()
        .isISO8601()
        .withMessage('Formato de fecha_desde inválido (usar ISO8601)'),

    query('fecha_hasta')
        .optional()
        .isISO8601()
        .withMessage('Formato de fecha_hasta inválido (usar ISO8601)'),

    query('ci')
        .optional()
        .isLength({ min: 1, max: 20 })
        .withMessage('CI de búsqueda inválido'),

    query('nombre')
        .optional()
        .isLength({ min: 1, max: 200 })
        .withMessage('Nombre de búsqueda inválido'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Número de página debe ser mayor a 0'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Límite debe estar entre 1 y 100')
];

/**
 * Validaciones para actualizar estado
 */
const validarActualizarEstado = [
    param('id')
        .notEmpty()
        .withMessage('El ID es obligatorio')
        .isUUID()
        .withMessage('El ID debe ser un UUID válido'),

    body('estado')
        .notEmpty()
        .withMessage('El estado es obligatorio')
        .isIn(['PENDIENTE', 'VALIDADO', 'OBSERVADO', 'RECHAZADO', 'APROBADO'])
        .withMessage('Estado inválido'),

    body('observaciones')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Las observaciones no pueden exceder 1000 caracteres')
];

// ====================================================================
// RUTAS PRINCIPALES
// ====================================================================

/**
 * @route   POST /api/preinscripciones
 * @desc    Crear nueva preinscripción
 * @access  Public (durante período activo)
 * @body    {objeto completo de preinscripción}
 */
router.post('/', 
    validarCrearPreinscripcion,
    preinscripcionController.crear
);

/**
 * @route   GET /api/preinscripciones/estado/:ci
 * @desc    Consultar estado de preinscripción por CI
 * @access  Public
 * @params  ci - Cédula de identidad
 */
router.get('/estado/:ci',
    validarConsultarCI,
    preinscripcionController.consultarEstado
);

/**
 * @route   GET /api/preinscripciones/health
 * @desc    Health check del servicio de preinscripciones
 * @access  Public
 */
router.get('/health',
    preinscripcionController.healthCheck
);

/**
 * @route   GET /api/preinscripciones/periodo/activo
 * @desc    Verificar si hay período de inscripción activo
 * @access  Public
 */
router.get('/periodo/activo',
    preinscripcionController.verificarPeriodoActivo
);

/**
 * @route   GET /api/preinscripciones/estadisticas
 * @desc    Obtener estadísticas de preinscripciones
 * @access  Private (Admin)
 */
router.get('/estadisticas',
    // TODO: Agregar middleware de autenticación
    preinscripcionController.obtenerEstadisticas
);

/**
 * @route   GET /api/preinscripciones/:id
 * @desc    Obtener preinscripción completa por ID
 * @access  Private (Admin/Staff)
 * @params  id - UUID de la preinscripción
 */
router.get('/:id',
    validarObtenerPorId,
    // TODO: Agregar middleware de autenticación
    preinscripcionController.obtenerPorId
);

/**
 * @route   GET /api/preinscripciones
 * @desc    Listar preinscripciones con filtros y paginación
 * @access  Private (Admin/Staff)
 * @query   estado, fecha_desde, fecha_hasta, ci, nombre, page, limit
 */
router.get('/',
    validarListar,
    // TODO: Agregar middleware de autenticación
    preinscripcionController.listar
);

/**
 * @route   PATCH /api/preinscripciones/:id/estado
 * @desc    Actualizar estado de preinscripción
 * @access  Private (Admin/Staff)
 * @params  id - UUID de la preinscripción
 * @body    {estado, observaciones?}
 */
router.patch('/:id/estado',
    validarActualizarEstado,
    // TODO: Agregar middleware de autenticación y autorización
    preinscripcionController.actualizarEstado
);

// ====================================================================
// MIDDLEWARE DE MANEJO DE ERRORES ESPECÍFICO
// ====================================================================

router.use((error, req, res, next) => {
    console.error('Error en rutas de preinscripciones:', error);
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            error: 'JSON inválido',
            message: 'El cuerpo de la solicitud contiene JSON malformado'
        });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: 'Archivo muy grande',
            message: 'El archivo excede el tamaño máximo permitido'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'Error no manejado en el servidor'
    });
});

module.exports = router;