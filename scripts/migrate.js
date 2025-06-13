const { query, testConnection } = require('../src/config/database');

const createTables = async () => {
  console.log('🚀 Iniciando migración de base de datos...');

  try {
    // Verificar conexión
    const connected = await testConnection();
    if (!connected) {
      throw new Error('No se pudo conectar a la base de datos');
    }

    // Crear extensión para UUID
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ Extensión UUID creada');

    // Tabla usuarios
    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre_usuario VARCHAR(100) UNIQUE NOT NULL,
        contrasena VARCHAR(255) NOT NULL,
        rol VARCHAR(20) CHECK (rol IN ('ADMINISTRADOR', 'PERSONAL_ADMISIONES')) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla usuarios creada');

    // Tabla colegios
    await query(`
      CREATE TABLE IF NOT EXISTS colegios (
        id_colegio UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(200) UNIQUE NOT NULL,
        tipo VARCHAR(20) CHECK (tipo IN ('FISCAL', 'PARTICULAR', 'CEMA')) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla colegios creada');

    // Tabla postulantes
    await query(`
      CREATE TABLE IF NOT EXISTS postulantes (
        id_postulante UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre VARCHAR(200) NOT NULL,
        ci VARCHAR(50) UNIQUE NOT NULL,
        nacionalidad VARCHAR(100),
        ciudad_procedencia VARCHAR(100),
        colegio_id UUID REFERENCES colegios(id_colegio),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla postulantes creada');

    // Tabla documentos
    await query(`
      CREATE TABLE IF NOT EXISTS documentos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        postulante_id UUID UNIQUE NOT NULL REFERENCES postulantes(id_postulante) ON DELETE CASCADE,
        fotocopia_ci BOOLEAN DEFAULT FALSE,
        certificado_nacimiento BOOLEAN DEFAULT FALSE,
        fotografias BOOLEAN DEFAULT FALSE,
        titulo_bachiller BOOLEAN DEFAULT FALSE,
        visa_estudiantil BOOLEAN DEFAULT FALSE,
        fecha_entrega_ci TIMESTAMP,
        fecha_entrega_certificado TIMESTAMP,
        fecha_entrega_fotos TIMESTAMP,
        fecha_entrega_titulo TIMESTAMP,
        fecha_entrega_visa TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla documentos creada');

    // Tabla personas_contacto
    await query(`
      CREATE TABLE IF NOT EXISTS personas_contacto (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        postulante_id UUID NOT NULL REFERENCES postulantes(id_postulante) ON DELETE CASCADE,
        nombre VARCHAR(200) NOT NULL,
        parentesco VARCHAR(50) NOT NULL,
        telefono VARCHAR(20) NOT NULL,
        correo VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla personas_contacto creada');

    // Tabla periodos_inscripcion
    await query(`
      CREATE TABLE IF NOT EXISTS periodos_inscripcion (
        id_periodo UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        estado BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla periodos_inscripcion creada');

    // Tabla preinscripciones
    await query(`
      CREATE TABLE IF NOT EXISTS preinscripciones (
        id_preinscripcion UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        postulante_id UUID NOT NULL REFERENCES postulantes(id_postulante),
        periodo_id UUID NOT NULL REFERENCES periodos_inscripcion(id_periodo),
        creada_por_id UUID NOT NULL REFERENCES usuarios(id_usuario),
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(20) CHECK (estado IN ('PENDIENTE', 'APROBADA', 'OBSERVADA', 'RECHAZADA')) DEFAULT 'PENDIENTE',
        resumen_datos TEXT,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla preinscripciones creada');

    // Tabla datos_ocr
    await query(`
      CREATE TABLE IF NOT EXISTS datos_ocr (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        postulante_id UUID UNIQUE NOT NULL REFERENCES postulantes(id_postulante) ON DELETE CASCADE,
        datos_extraidos TEXT NOT NULL,
        confianza DECIMAL(5,2),
        imagen_frontal VARCHAR(500),
        imagen_posterior VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla datos_ocr creada');

    // Tabla logs_sistema
    await query(`
      CREATE TABLE IF NOT EXISTS logs_sistema (
        id_log UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES usuarios(id_usuario),
        accion VARCHAR(100) NOT NULL,
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        detalles TEXT,
        ip_address VARCHAR(45)
      )
    `);
    console.log('✅ Tabla logs_sistema creada');

    // Tabla estadisticas
    await query(`
      CREATE TABLE IF NOT EXISTS estadisticas (
        id_estadistica UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        fecha DATE NOT NULL,
        cantidad_inscritos INTEGER NOT NULL,
        colegio VARCHAR(200),
        carrera VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla estadisticas creada');

    // Tabla reportes
    await query(`
      CREATE TABLE IF NOT EXISTS reportes (
        id_reporte UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tipo VARCHAR(20) CHECK (tipo IN ('DIARIO', 'SEMANAL', 'MENSUAL', 'ANUAL')) NOT NULL,
        fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        formato VARCHAR(10) CHECK (formato IN ('PDF', 'EXCEL')) NOT NULL,
        contenido TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla reportes creada');

    // Crear índices para optimización
    await query('CREATE INDEX IF NOT EXISTS idx_postulantes_ci ON postulantes(ci)');
    await query('CREATE INDEX IF NOT EXISTS idx_preinscripciones_fecha ON preinscripciones(fecha_registro)');
    await query('CREATE INDEX IF NOT EXISTS idx_preinscripciones_estado ON preinscripciones(estado)');
    await query('CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_sistema(fecha_hora)');
    console.log('✅ Índices creados');

    // Insertar usuario administrador por defecto
    await query(`
      INSERT INTO usuarios (nombre_usuario, contrasena, rol) 
      VALUES ('admin', '$2a$10$xQHF1Y2QZV8WQmE5QZV8WOs.D9YmI5gYqJX5gYqJX5gYqJX5gYqJX', 'ADMINISTRADOR')
      ON CONFLICT (nombre_usuario) DO NOTHING
    `);
    console.log('✅ Usuario administrador creado');

    // Insertar algunos colegios de ejemplo
    const colegiosEjemplo = [
      ['Colegio San Calixto', 'PARTICULAR'],
      ['Unidad Educativa Alemán', 'PARTICULAR'],
      ['Colegio Nacional Bolivia', 'FISCAL'],
      ['CEMA La Paz', 'CEMA']
    ];

    for (const [nombre, tipo] of colegiosEjemplo) {
      await query(`
        INSERT INTO colegios (nombre, tipo) 
        VALUES ($1, $2)
        ON CONFLICT (nombre) DO NOTHING
      `, [nombre, tipo]);
    }
    console.log('✅ Colegios de ejemplo insertados');

    console.log('🎉 ¡Migración completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    throw error;
  }
};

// Ejecutar migración si se llama directamente
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('✅ Base de datos lista para usar');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Falló la migración:', error);
      process.exit(1);
    });
}

module.exports = { createTables };