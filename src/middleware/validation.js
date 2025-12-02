// middleware/validation.js
const { pool } = require('../config/database');

/**
 * Validador genérico usando esquema Joi o función custom
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: 'Validación fallida',
        message: 'Los datos proporcionados no son válidos',
        errors
      });
    }

    req.validatedBody = value;
    next();
  };
};

/**
 * Valida CI boliviano
 */
const validateCI = (ci) => {
  if (!ci) return false;
  
  // CI debe ser string o número de 6-10 dígitos
  const ciStr = String(ci).trim();
  const ciRegex = /^\d{6,10}$/;
  
  return ciRegex.test(ciStr);
};

/**
 * Valida email
 */
const validateEmail = (email) => {
  if (!email) return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida teléfono boliviano
 */
const validatePhone = (phone) => {
  if (!phone) return false;
  
  // Teléfono boliviano: 7-8 dígitos opcionalmente con código de país
  const phoneStr = String(phone).replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^(\+?591)?[67]\d{7}$/;
  
  return phoneRegex.test(phoneStr);
};

/**
 * Valida fecha en formato DD/MM/YYYY o YYYY-MM-DD
 */
const validateDate = (date) => {
  if (!date) return false;
  
  const dateRegex1 = /^\d{2}\/\d{2}\/\d{4}$/; // DD/MM/YYYY
  const dateRegex2 = /^\d{4}-\d{2}-\d{2}$/;    // YYYY-MM-DD
  
  if (!dateRegex1.test(date) && !dateRegex2.test(date)) {
    return false;
  }

  // Validar que sea fecha válida
  let day, month, year;
  
  if (dateRegex1.test(date)) {
    [day, month, year] = date.split('/').map(Number);
  } else {
    [year, month, day] = date.split('-').map(Number);
  }

  const dateObj = new Date(year, month - 1, day);
  return dateObj.getFullYear() === year && 
         dateObj.getMonth() === month - 1 && 
         dateObj.getDate() === day;
};

/**
 * Middleware de sanitización de inputs
 */
const sanitize = (req, res, next) => {
  // Sanitizar strings en body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitizar query params
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Sanitiza un objeto recursivamente
 */
const sanitizeObject = (obj) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      // Remover espacios al inicio/final
      let cleaned = value.trim();
      
      // Escapar caracteres HTML peligrosos
      cleaned = cleaned
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
      
      sanitized[key] = cleaned;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeObject(item) : item
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Valida parámetros de paginación
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  // Límites razonables
  if (page < 1) {
    return res.status(400).json({
      success: false,
      error: 'Página inválida',
      message: 'El número de página debe ser mayor o igual a 1'
    });
  }

  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      error: 'Límite inválido',
      message: 'El límite debe estar entre 1 y 100'
    });
  }

  req.pagination = {
    page,
    limit,
    offset: (page - 1) * limit
  };

  next();
};

/**
 * Valida que un período académico exista y esté activo
 */
const validatePeriodoActivo = async (req, res, next) => {
  try {
    const { periodo_id } = req.body;

    if (!periodo_id) {
      return res.status(400).json({
        success: false,
        error: 'Período requerido',
        message: 'Se debe especificar un período académico'
      });
    }

    const periodoQuery = await pool.query(
      `SELECT id, nombre, activo, fecha_inicio, fecha_fin
       FROM periodos_inscripcion
       WHERE id = $1`,
      [periodo_id]
    );

    if (periodoQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Período no encontrado',
        message: 'El período académico especificado no existe'
      });
    }

    const periodo = periodoQuery.rows[0];

    if (!periodo.activo) {
      return res.status(400).json({
        success: false,
        error: 'Período inactivo',
        message: 'El período académico no está activo para preinscripciones'
      });
    }

    // Verificar fechas
    const now = new Date();
    const inicio = new Date(periodo.fecha_inicio);
    const fin = new Date(periodo.fecha_fin);

    if (now < inicio || now > fin) {
      return res.status(400).json({
        success: false,
        error: 'Período fuera de rango',
        message: `Las preinscripciones para este período están disponibles del ${inicio.toLocaleDateString()} al ${fin.toLocaleDateString()}`
      });
    }

    req.periodo = periodo;
    next();

  } catch (error) {
    console.error('Error validando período:', error);
    return res.status(500).json({
      success: false,
      error: 'Error validando período',
      message: 'Ha ocurrido un error al validar el período académico'
    });
  }
};

/**
 * Valida UUID v4
 */
const validateUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Middleware para validar parámetro ID como UUID
 */
const validateUUIDParam = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!validateUUID(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID inválido',
        message: `El parámetro '${paramName}' debe ser un UUID válido`
      });
    }

    next();
  };
};

/**
 * Valida campos requeridos en body
 */
const requireFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];

    for (const field of fields) {
      if (!req.body[field] && req.body[field] !== 0 && req.body[field] !== false) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Campos requeridos faltantes',
        message: `Los siguientes campos son requeridos: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    next();
  };
};

module.exports = {
  validate,
  sanitize,
  validatePagination,
  validatePeriodoActivo,
  validateUUIDParam,
  requireFields,
  // Funciones de validación
  validateCI,
  validateEmail,
  validatePhone,
  validateDate,
  validateUUID
};