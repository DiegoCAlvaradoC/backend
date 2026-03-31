const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Configuración de base de datos
const { testConnection } = require('./config/database');

// Middlewares personalizados
const { authenticate, authorize, ROLES } = require('./middleware/auth');

// Rutas de todos los módulos
const ocrRoutes = require('./routes/ocr');
const preinscripcionRoutes = require('./routes/preinscripciones');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const reportesRoutes = require('./routes/reportes');
const prediccionRoutes = require('./routes/prediccion');
const periodsRoutes = require('./routes/periods');
const adminUsuariosRoutes = require('./routes/admin-usuarios');


const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    'http://localhost:8081',     // Frontend React Native
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

// Rate limiting para preinscripciones
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
  skip: (req) => req.method !== 'POST'
});

// Rate limiting para autenticación (prevenir fuerza bruta)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos de login por IP
  message: {
    success: false,
    error: 'Demasiados intentos de inicio de sesión',
    message: 'Cuenta temporalmente bloqueada. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

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


app.use((req, res, next) => {
  const start = Date.now();

  // Log de request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });

  if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '[REDACTED]';
    if (safeBody.datosOCR) safeBody.datosOCR = '[Datos OCR presentes]';
    if (safeBody.contactos) safeBody.contactos = `[${safeBody.contactos.length} contactos]`;
    console.log('Body:', JSON.stringify(safeBody, null, 2));
  }

  // Override del res.json para logging de responses
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;

    // Log de response
    console.log(` ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
      success: body?.success,
      dataPresent: !!body?.data,
      error: body?.error
    });

    return originalJson.call(this, body);
  };

  next();
});

// Ruta raíz con información completa
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'UCB Admissions Backend API - Sistema Completo',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: '/api/auth/*',
      ocr: '/api/ocr/*',
      preinscripciones: '/api/preinscripciones/*',
      admin: '/api/admin/*',
      periods: '/api/admin/periodos/*', 
      reportes: '/api/reportes/*',
      prediccion: '/api/prediccion/*',
      health: '/health',
      info: '/api/info'
    },
    features: [
      ' Autenticación JWT con refresh tokens',
      ' OCR para carnets de identidad',
      ' Preinscripciones con validación completa',
      ' Panel administrativo completo',
      ' Gestión de períodos de inscripción', 
      ' Reportería y estadísticas avanzadas',
      ' Predicciones con Machine Learning',
      ' Control de acceso basado en roles (RBAC)',
      ' Rate limiting de seguridad',
      ' Logging y auditoría detallada',
      ' Health checks completos'
    ]
  });
});

// Información detallada de la API
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    api: 'Sistema de Admisiones UCB - Backend Completo',
    version: '3.0.0',
    documentation: {
      auth: 'Autenticación y autorización JWT',
      ocr: 'Reconocimiento óptico de carnets bolivianos',
      preinscripciones: 'Sistema completo de preinscripciones',
      admin: 'Gestión administrativa y períodos',
      periods: 'Gestión de períodos de inscripción', 
      reportes: 'Reportería y estadísticas',
      prediccion: 'Machine Learning y predicciones'
    },
    modules: {
      authentication: {
        endpoints: 7,
        features: ['JWT', 'Refresh Tokens', 'RBAC', 'Password Hashing']
      },
      ocr: {
        endpoints: 3,
        features: ['Base64 Processing', 'Image Validation', 'Data Extraction']
      },
      preinscripciones: {
        endpoints: 8,
        features: ['CRUD Complete', 'Status Workflow', 'Validation']
      },
      administration: {
        endpoints: 11,
        features: ['Period Management', 'User Management', 'Audit Logs']
      },
      periods: {
        endpoints: 7,
        features: ['CRUD Complete', 'Active Period Management', 'Validation']
      },
      reports: {
        endpoints: 8,
        features: ['Statistics', 'Trends', 'Demographics', 'CSV Export']
      },
      predictions: {
        endpoints: 4,
        features: ['Linear Regression', 'Scoring', 'Risk Analysis']
      }
    },
    totalEndpoints: 48, 
    timestamp: new Date().toISOString()
  });
});

// Health check general mejorado
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();

    // Test de servicios
    const servicesHealth = {
      preinscripciones: { status: 'unknown' },
      auth: { status: 'operational' },
      admin: { status: 'operational' },
      periods: { status: 'operational' }, 
      reportes: { status: 'operational' },
      prediccion: { status: 'operational' }
    };

    // Test del servicio de preinscripciones
    try {
      const preinscripcionService = require('./services/preinscripcionService');
      const healthResult = await preinscripcionService.healthCheck();
      servicesHealth.preinscripciones = {
        status: healthResult.status === 'healthy' ? 'operational' : 'degraded',
        details: healthResult
      };
    } catch (error) {
      servicesHealth.preinscripciones = {
        status: 'down',
        error: error.message
      };
    }

    // Determinar estado general
    const allServicesOperational = Object.values(servicesHealth)
        .every(service => service.status === 'operational');

    const overallStatus = dbConnected && allServicesOperational
        ? 'healthy'
        : 'degraded';

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      success: true,
      status: overallStatus,
      services: {
        api: 'operational',
        database: dbConnected ? 'operational' : 'down',
        ocr: 'operational',
        preinscripciones: servicesHealth.preinscripciones.status,
        auth: servicesHealth.auth.status,
        admin: servicesHealth.admin.status,
        periods: servicesHealth.periods.status, 
        reportes: servicesHealth.reportes.status,
        prediccion: servicesHealth.prediccion.status
      },
      details: {
        preinscripciones: servicesHealth.preinscripciones.details
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '3.0.0'
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
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/ocr', ocrRoutes);

app.use('/api/preinscripciones', preinscripcionLimiter, preinscripcionRoutes);
app.use('/api/admin', periodsRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/prediccion', prediccionRoutes);

app.use('/api/admin/usuarios', adminUsuariosRoutes);

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableModules: {
      auth: {
        base: '/api/auth',
        endpoints: [
          'POST /api/auth/register',
          'POST /api/auth/login',
          'POST /api/auth/refresh',
          'POST /api/auth/logout',
          'GET /api/auth/profile',
          'PATCH /api/auth/profile',
          'POST /api/auth/change-password'
        ]
      },
      ocr: {
        base: '/api/ocr',
        endpoints: [
          'POST /api/ocr/process-complete',
          'POST /api/ocr/process-base64',
          'GET /api/ocr/health'
        ]
      },
      preinscripciones: {
        base: '/api/preinscripciones',
        endpoints: [
          'POST /api/preinscripciones',
          'GET /api/preinscripciones/estado/:ci',
          'GET /api/preinscripciones/health',
          'GET /api/preinscripciones/periodo/activo',
          'GET /api/preinscripciones/estadisticas',
          'GET /api/preinscripciones/:id',
          'GET /api/preinscripciones',
          'PATCH /api/preinscripciones/:id/estado'
        ]
      },
      admin: {
        base: '/api/admin',
        authentication: 'required',
        role: 'ADMINISTRADOR/staff',
        endpoints: [
          'POST /api/admin/periodos',
          'GET /api/admin/periodos',
          'GET /api/admin/periodos/activo/current',
          'GET /api/admin/periodos/:id',
          'PATCH /api/admin/periodos/:id',
          'DELETE /api/admin/periodos/:id',
          'GET /api/admin/health',
          'GET /api/admin/usuarios',
          'POST /api/admin/usuarios',
          'PATCH /api/admin/usuarios/:id/rol',
          'PATCH /api/admin/usuarios/:id/estado',
          'GET /api/admin/logs'
        ]
      },
      reportes: {
        base: '/api/reportes',
        authentication: 'required',
        role: 'ADMINISTRADOR/staff/revisor',
        endpoints: [
          'GET /api/reportes/estadisticas',
          'GET /api/reportes/distribucion-carreras',
          'GET /api/reportes/tendencia',
          'GET /api/reportes/metricas-ocr',
          'GET /api/reportes/demografia',
          'GET /api/reportes/rendimiento',
          'GET /api/reportes/completo',
          'GET /api/reportes/exportar-csv'
        ]
      },
      prediccion: {
        base: '/api/prediccion',
        authentication: 'required',
        role: 'ADMINISTRADOR/staff',
        endpoints: [
          'POST /api/prediccion/inscripciones',
          'POST /api/prediccion/carrera',
          'GET /api/prediccion/scoring/:preinscripcion_id',
          'GET /api/prediccion/desercion/:postulante_id'
        ]
      }
    }
  });
});

// Middleware de manejo de errores global
app.use((error, req, res, next) => {
  console.error(' Error global:', {
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


const startServer = async () => {
  try {
    console.log('\n ========================================');
    console.log('   INICIANDO SERVIDOR UCB ADMISSIONS');

    // Testear conexión a la base de datos
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('  Base de datos no disponible, continuando sin BD...');
    } else {
      console.log(' Base de datos conectada correctamente');
    }

    // Verificar servicios
    console.log('\n Verificando servicios...');

    try {
      console.log('  • Verificando servicio de preinscripciones...');
      const preinscripcionService = require('./services/preinscripcionService');
      await preinscripcionService.healthCheck();
      console.log('   Servicio de preinscripciones operativo');
    } catch (error) {
      console.warn('   Servicio de preinscripciones con problemas:', error.message);
    }

    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(` URL: http://localhost:${PORT}`);
      console.log(` Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Base de datos: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`);
      console.log(` OCR Language: ${process.env.OCR_LANGUAGE || 'spa'}`);
      console.log(` Upload Path: ${process.env.UPLOAD_PATH || './uploads'}`);

      console.log('\n MÓDULOS Y ENDPOINTS DISPONIBLES:');
      console.log('     GET  / - Información general del sistema');
      console.log('     GET  /health - Health check completo');
      console.log('    GET  /api/info - Documentación de API');

      console.log('\n  MÓDULO AUTENTICACIÓN (7 endpoints):');
      console.log('   POST /api/auth/register - Registrar nuevo usuario');
      console.log('   POST /api/auth/login - Iniciar sesión');
      console.log('   POST /api/auth/refresh - Renovar access token');
      console.log('   POST /api/auth/logout - Cerrar sesión');
      console.log('   GET  /api/auth/profile - Ver perfil');
      console.log('   PATCH /api/auth/profile - Actualizar perfil');
      console.log('   POST /api/auth/change-password - Cambiar contraseña');

      console.log('\n   📷 MÓDULO OCR (3 endpoints):');
      console.log('   POST /api/ocr/process-complete - Procesar carnet completo');
      console.log('   POST /api/ocr/process-base64 - Procesar desde Base64');
      console.log('   GET  /api/ocr/health - Health check OCR');

      console.log('\n   📝 MÓDULO PREINSCRIPCIONES (8 endpoints):');
      console.log('   POST  /api/preinscripciones - Crear preinscripción');
      console.log('   GET   /api/preinscripciones/estado/:ci - Consultar por CI');
      console.log('   GET   /api/preinscripciones/health - Health check');
      console.log('   GET   /api/preinscripciones/periodo/activo - Verificar período');
      console.log('   GET   /api/preinscripciones/estadisticas - Estadísticas (🔒)');
      console.log('   GET   /api/preinscripciones/:id - Obtener por ID (🔒)');
      console.log('   GET   /api/preinscripciones - Listar con filtros (🔒)');
      console.log('   PATCH /api/preinscripciones/:id/estado - Actualizar estado (🔒)');

      console.log('\n    MÓDULO ADMINISTRACIÓN (11 endpoints) :');
      console.log('   GET    /api/admin/usuarios - Listar usuarios');
      console.log('   POST   /api/admin/usuarios - Crear usuario');
      console.log('   PATCH  /api/admin/usuarios/:id/rol - Cambiar rol');
      console.log('   PATCH  /api/admin/usuarios/:id/estado - Cambiar estado');
      console.log('   GET    /api/admin/logs - Consultar logs de auditoría');

      console.log('\n   📅 MÓDULO PERÍODOS (7 endpoints) 🔒:'); // ✅ NUEVO
      console.log('   POST   /api/admin/periodos - Crear período');
      console.log('   GET    /api/admin/periodos - Listar períodos');
      console.log('   GET    /api/admin/periodos/activo/current - Período activo');
      console.log('   GET    /api/admin/periodos/:id - Obtener período');
      console.log('   PATCH  /api/admin/periodos/:id - Actualizar período');
      console.log('   DELETE /api/admin/periodos/:id - Eliminar período');
      console.log('   GET    /api/admin/health - Health check');

      console.log('\n    MÓDULO REPORTES (8 endpoints) :');
      console.log('   GET /api/reportes/estadisticas - Estadísticas generales');
      console.log('   GET /api/reportes/distribucion-carreras - Por carrera');
      console.log('   GET /api/reportes/tendencia - Tendencias temporales');
      console.log('   GET /api/reportes/metricas-ocr - Calidad OCR');
      console.log('   GET /api/reportes/demografia - Análisis demográfico');
      console.log('   GET /api/reportes/rendimiento - Métricas de rendimiento');
      console.log('   GET /api/reportes/completo - Reporte consolidado');
      console.log('   GET /api/reportes/exportar-csv - Exportar a CSV');

      console.log('\n    MÓDULO PREDICCIÓN ML (4 endpoints) :');
      console.log('   POST /api/prediccion/inscripciones - Predicción de inscripciones');
      console.log('   POST /api/prediccion/carrera - Predicción por carrera');
      console.log('   GET  /api/prediccion/scoring/:preinscripcion_id - Scoring de postulante');
      console.log('   GET  /api/prediccion/desercion/:postulante_id - Riesgo de deserción');

      console.log('\n = Requiere autenticación JWT');
      console.log(' = Requiere rol admin, staff o revisor');
      console.log(' = Requiere rol admin o staff');

      console.log('\n ESTADÍSTICAS DEL SISTEMA:');
      console.log('   • Total de módulos: 7'); 
      console.log('   • Total de endpoints: 48'); 
      console.log('   • Endpoints públicos: 14');
      console.log('   • Endpoints protegidos: 34'); 

      console.log('\n Listo para recibir requests del frontend!');
      console.log('========================================\n');
    });

    const gracefulShutdown = () => {
      console.log('\n Iniciando cierre elegante del servidor...');
      server.close(() => {
        console.log(' Servidor cerrado exitosamente');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error(' Error iniciando servidor:', error);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason, promise) => {
  console.error(' Unhandled Rejection en:', promise, 'razón:', reason);
  // No salir del proceso en desarrollo
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  process.exit(1);
});


// Iniciar servidor si este archivo es ejecutado directamente
if (require.main === module) {
  startServer();
}

module.exports = app;
