const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Importar configuración y rutas
const { testConnection } = require('./config/database');
const ocrRoutes = require('./routes/ocr');
// 🆕 NUEVA IMPORTACIÓN - Rutas de preinscripciones
const preinscripcionRoutes = require('./routes/preinscripciones');

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// ====================================================================
// CONFIGURACIÓN DE CORS MEJORADA
// ====================================================================

const corsOptions = {
  origin: [
    'http://localhost:8081',     // Tu frontend actual
    'http://localhost:19006',    // Expo web
    'exp://localhost:19000',     // Expo mobile
    'exp://localhost:8081',      // Expo desarrollo
    'http://localhost:3001',     // Frontend alternativo
    'http://192.168.1.100:19006', // IP local para móviles
    'http://127.0.0.1:8081',     // Alternativa localhost
    'null',                      // Para archivos HTML locales (file://)
    process.env.FRONTEND_URL     // URL del frontend en producción
  ].filter(Boolean),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// ====================================================================
// RATE LIMITING CONFIGURADO
// ====================================================================

// Rate limiting general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP cada 15 minutos
  message: {
    success: false,
    error: 'Límite de solicitudes excedido',
    message: 'Demasiadas solicitudes desde esta IP. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting específico para preinscripciones
const preinscripcionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 preinscripciones por IP cada 15 minutos
  message: {
    success: false,
    error: 'Límite de preinscripciones excedido',
    message: 'Demasiadas preinscripciones desde esta IP. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Solo aplicar a POST de preinscripciones
  skip: (req) => req.method !== 'POST'
});

// ====================================================================
// MIDDLEWARES GLOBALES
// ====================================================================

// Seguridad HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
app.use(cors(corsOptions));

// Rate limiting general
app.use(generalLimiter);

// Logging HTTP requests (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('combined'));
}

// Parse JSON bodies con límite aumentado para imágenes Base64
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Parse URL-encoded bodies
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static('uploads'));

// ====================================================================
// MIDDLEWARE DE LOGGING PERSONALIZADO MEJORADO
// ====================================================================

app.use((req, res, next) => {
  const start = Date.now();
  
  // Log de request
  console.log(`🌐 ${new Date().toISOString()} - ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });

  // Log del body solo para requests importantes (no para GET)
  if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    // Log limitado para evitar mostrar datos sensibles
    const safeBody = { ...req.body };
    if (safeBody.datosOCR) {
      safeBody.datosOCR = '[Datos OCR presentes]';
    }
    if (safeBody.contactos) {
      safeBody.contactos = `[${safeBody.contactos.length} contactos]`;
    }
    console.log('📝 Body:', JSON.stringify(safeBody, null, 2));
  }

  // Override del res.json para logging de responses
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    
    // Log de response
    console.log(`📤 ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
      success: body?.success,
      dataPresent: !!body?.data,
      error: body?.error
    });
    
    return originalJson.call(this, body);
  };

  next();
});

// ====================================================================
// RUTAS PRINCIPALES
// ====================================================================

// Ruta raíz con información mejorada
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'UCB Admissions Backend API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      ocr: '/api/ocr/*',
      preinscripciones: '/api/preinscripciones/*', // 🆕 NUEVO
      health: '/health',
      info: '/api/info'
    },
    features: [
      'OCR para carnets de identidad',
      'Preinscripciones con validación completa', // 🆕 NUEVO
      'Rate limiting de seguridad',
      'Logging detallado',
      'Health checks'
    ]
  });
});

// Información detallada de la API
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    api: 'Sistema de Admisiones UCB',
    version: '2.0.0',
    documentation: {
      ocr: 'Reconocimiento óptico de carnets bolivianos',
      preinscripciones: 'Sistema completo de preinscripciones con validación' // 🆕 NUEVO
    },
    endpoints: {
      // Endpoints OCR existentes
      'POST /api/ocr/process-complete': 'Procesar carnet completo (frontal y posterior)',
      'POST /api/ocr/process-base64': 'Procesar carnet desde Base64',
      'GET /api/ocr/health': 'Health check del servicio OCR',
      // 🆕 NUEVOS ENDPOINTS de preinscripciones
      'POST /api/preinscripciones': 'Crear preinscripción completa',
      'GET /api/preinscripciones/estado/:ci': 'Consultar estado por CI',
      'GET /api/preinscripciones/health': 'Health check preinscripciones',
      'GET /api/preinscripciones/periodo/activo': 'Verificar período activo'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check general mejorado
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    
    // 🆕 Test del servicio de preinscripciones
    let preinscripcionesHealth = { status: 'unknown' };
    try {
      const preinscripcionService = require('./services/preinscripcionService');
      const healthResult = await preinscripcionService.healthCheck();
      preinscripcionesHealth = {
        status: healthResult.status === 'healthy' ? 'operational' : 'degraded',
        details: healthResult
      };
    } catch (error) {
      preinscripcionesHealth = {
        status: 'down',
        error: error.message
      };
    }
    
    const overallStatus = dbConnected && preinscripcionesHealth.status === 'operational' 
      ? 'healthy' 
      : 'degraded';
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      success: true,
      status: overallStatus,
      services: {
        api: 'operational',
        database: dbConnected ? 'operational' : 'down',
        ocr: 'operational',
        preinscripciones: preinscripcionesHealth.status // 🆕 NUEVO
      },
      details: {
        preinscripciones: preinscripcionesHealth.details
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ====================================================================
// REGISTRAR RUTAS DE MÓDULOS
// ====================================================================

// Rutas existentes de OCR
app.use('/api/ocr', ocrRoutes);

// 🆕 NUEVAS RUTAS - Preinscripciones con rate limiting específico
app.use('/api/preinscripciones', 
  preinscripcionLimiter,  // Rate limiting específico
  preinscripcionRoutes    // Rutas de preinscripciones
);

// ====================================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ====================================================================

// Middleware 404 - Ruta no encontrada
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/info',
      'POST /api/ocr/process-complete',
      'POST /api/ocr/process-base64',
      'GET /api/ocr/health',
      '🆕 POST /api/preinscripciones',
      '🆕 GET /api/preinscripciones/estado/:ci',
      '🆕 GET /api/preinscripciones/health'
    ]
  });
});

// Middleware de manejo de errores global mejorado
app.use((error, req, res, next) => {
  console.error('❌ Error global:', {
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Error de validación
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      message: 'Los datos proporcionados no son válidos',
      details: error.details || error.message,
      timestamp: new Date().toISOString()
    });
  }

  // Errores específicos de Express
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Cuerpo de solicitud muy grande',
      message: 'El tamaño de la solicitud excede el límite permitido (10MB)',
      timestamp: new Date().toISOString()
    });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'JSON malformado',
      message: 'El cuerpo de la solicitud contiene JSON inválido',
      timestamp: new Date().toISOString()
    });
  }

  // Error de base de datos (PostgreSQL)
  if (error.code && error.code.startsWith('23')) {
    return res.status(409).json({
      success: false,
      error: 'Error de integridad en base de datos',
      message: 'Conflicto de datos en la base de datos',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Conflicto de datos',
      timestamp: new Date().toISOString()
    });
  }

  // Error de conexión a base de datos
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      error: 'Error de conexión a base de datos',
      message: 'No se pudo conectar a la base de datos',
      timestamp: new Date().toISOString()
    });
  }

  // Error genérico
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Ha ocurrido un error inesperado',
    timestamp: new Date().toISOString()
  });
});

// ====================================================================
// FUNCIÓN PARA INICIAR EL SERVIDOR
// ====================================================================

const startServer = async () => {
  try {
    console.log('\n🚀 ========================================');
    console.log('   INICIANDO SERVIDOR UCB ADMISSIONS');
    console.log('========================================');
    
    // Testear conexión a la base de datos
    console.log('🔌 Verificando conexión a base de datos...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('⚠️  Base de datos no disponible, continuando sin BD...');
    } else {
      console.log('✅ Base de datos conectada correctamente');
    }

    // 🆕 Verificar servicio de preinscripciones
    try {
      console.log('🔌 Verificando servicio de preinscripciones...');
      const preinscripcionService = require('./services/preinscripcionService');
      await preinscripcionService.healthCheck();
      console.log('✅ Servicio de preinscripciones operativo');
    } catch (error) {
      console.warn('⚠️  Servicio de preinscripciones con problemas:', error.message);
    }

    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log('\n✅ ========================================');
      console.log('   SERVIDOR INICIADO EXITOSAMENTE');
      console.log('========================================');
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Base de datos: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`);
      console.log(`🔧 OCR Language: ${process.env.OCR_LANGUAGE || 'spa'}`);
      console.log(`📁 Upload Path: ${process.env.UPLOAD_PATH || './uploads'}`);
      
      console.log('\n📋 ENDPOINTS DISPONIBLES:');
      console.log('   🏠  GET  / - Información general');
      console.log('   ❤️  GET  /health - Health check');
      console.log('   📄 GET  /api/info - Documentación');
      console.log('\n   📷 MÓDULO OCR:');
      console.log('   POST /api/ocr/process-complete - Procesar carnet completo');
      console.log('   POST /api/ocr/process-base64 - Procesar desde Base64');
      console.log('   GET  /api/ocr/health - Health check OCR');
      console.log('\n   🆕 MÓDULO PREINSCRIPCIONES:');
      console.log('   POST /api/preinscripciones - Crear preinscripción');
      console.log('   GET  /api/preinscripciones/estado/:ci - Consultar por CI');
      console.log('   GET  /api/preinscripciones/health - Health check');
      console.log('   GET  /api/preinscripciones/periodo/activo - Verificar período');
      
      console.log('\n🎯 Listo para recibir requests del frontend React Native!');
      console.log('========================================\n');
    });

    // Configurar cierre elegante
    const gracefulShutdown = () => {
      console.log('\n🛑 Iniciando cierre elegante del servidor...');
      server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

// ====================================================================
// MANEJO DE ERRORES NO CAPTURADOS
// ====================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection en:', promise, 'razón:', reason);
  // No salir del proceso en desarrollo
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// ====================================================================
// INICIAR SERVIDOR
// ====================================================================

// Iniciar servidor si este archivo es ejecutado directamente
if (require.main === module) {
  startServer();
}

module.exports = app;