// middleware/errorHandler.js
const { pool } = require('../config/database');

/**
 * Clase de Error Personalizado
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Registrar error en base de datos para auditoría
 */
const logErrorToDB = async (error, req, user = null) => {
  try {
    await pool.query(
      `INSERT INTO admisiones.logs_errores 
       (nivel, mensaje, stack, ruta, metodo, usuario_id, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'ERROR',
        error.message,
        error.stack,
        req.path,
        req.method,
        user?.id || null,
        req.ip,
        req.get('User-Agent')
      ]
    );
  } catch (logError) {
    console.error('Error registrando error en BD:', logError);
  }
};

/**
 * Formatea errores de validación de PostgreSQL
 */
const formatDBError = (error) => {
  // Error de constraint de unique
  if (error.code === '23505') {
    const field = error.detail?.match(/Key \((.*?)\)/)?.[1] || 'campo';
    return {
      statusCode: 409,
      message: `Ya existe un registro con este ${field}`,
      code: 'DUPLICATE_ENTRY',
      details: error.detail
    };
  }

  // Error de foreign key
  if (error.code === '23503') {
    return {
      statusCode: 400,
      message: 'Referencia a un registro que no existe',
      code: 'FOREIGN_KEY_VIOLATION',
      details: error.detail
    };
  }

  // Error de not null
  if (error.code === '23502') {
    const field = error.column || 'un campo requerido';
    return {
      statusCode: 400,
      message: `El campo '${field}' no puede estar vacío`,
      code: 'NULL_VIOLATION',
      details: error.detail
    };
  }

  // Error de check constraint
  if (error.code === '23514') {
    return {
      statusCode: 400,
      message: 'Valor fuera del rango permitido',
      code: 'CHECK_VIOLATION',
      details: error.detail
    };
  }

  // Error genérico de DB
  return {
    statusCode: 500,
    message: 'Error de base de datos',
    code: error.code,
    details: process.env.NODE_ENV === 'development' ? error.message : null
  };
};

/**
 * Middleware principal de manejo de errores
 */
const errorHandler = async (error, req, res, next) => {
  // Log del error
  console.error(` Timestamp: ${new Date().toISOString()}`);
  console.error(` Método: ${req.method} ${req.path}`);
  console.error(`IP: ${req.ip}`);
  console.error(`Usuario: ${req.user?.email || 'No autenticado'}`);
  console.error(' Error:', error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('║ Stack:', error.stack);
  }

  // Registrar error en BD (async, no bloqueante)
  if (req.user) {
    logErrorToDB(error, req, req.user).catch(err => 
      console.error('Error registrando en BD:', err)
    );
  }

  // Error operacional conocido
  if (error.isOperational) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.code || 'ERROR',
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString()
    });
  }

  // Error de validación de Joi/Express-validator
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Error de validación',
      details: error.details || error.message,
      timestamp: new Date().toISOString()
    });
  }

  // Error de JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token de autenticación inválido',
      timestamp: new Date().toISOString()
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Token de autenticación expirado',
      timestamp: new Date().toISOString()
    });
  }

  // Error de base de datos PostgreSQL
  if (error.code && typeof error.code === 'string' && error.code.startsWith('23')) {
    const dbError = formatDBError(error);
    return res.status(dbError.statusCode).json({
      success: false,
      error: dbError.code,
      message: dbError.message,
      details: dbError.details,
      timestamp: new Date().toISOString()
    });
  }

  // Error de conexión a DB
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      error: 'DB_CONNECTION_ERROR',
      message: 'Error de conexión a la base de datos',
      timestamp: new Date().toISOString()
    });
  }

  // Error de payload muy grande
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'El cuerpo de la solicitud excede el tamaño permitido',
      maxSize: '10MB',
      timestamp: new Date().toISOString()
    });
  }

  // Error de JSON malformado
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'El cuerpo de la solicitud contiene JSON inválido',
      timestamp: new Date().toISOString()
    });
  }

  // Error genérico no manejado
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Ha ocurrido un error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
};

/**
 * Middleware para capturar errores asíncronos
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware para rutas no encontradas (404)
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestion: 'Verifica la URL y el método HTTP'
  });
};

/**
 * Maneja errores no capturados de proceso
 */
const setupProcessErrorHandlers = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa:', promise);
    console.error('Razón:', reason);
    
    // En producción, cerrar el proceso
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    // Siempre cerrar en uncaught exception
    process.exit(1);
  });
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  setupProcessErrorHandlers,
  logErrorToDB
};