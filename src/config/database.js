const { Pool } = require('pg');
require('dotenv').config();

// Configuración del pool de conexiones
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433, // PostgreSQL 14 por defecto
  database: process.env.DB_NAME || 'ucb_admissions',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  max: 20, // Máximo número de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Función para testear la conexión
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a PostgreSQL exitosa');
    console.log(`📊 Base de datos: ${process.env.DB_NAME}`);
    console.log(`🏠 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
};

// Función para ejecutar queries con manejo de errores
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📝 Query ejecutada:', { text, duration: `${duration}ms`, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    console.error('📝 Query que falló:', text);
    throw error;
  }
};

// Función para obtener un cliente del pool (para transacciones)
const getClient = async () => {
  return await pool.connect();
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Cerrando pool de conexiones PostgreSQL...');
  pool.end(() => {
    console.log('✅ Pool de conexiones cerrado');
    process.exit(0);
  });
});

module.exports = {
  pool,
  query,
  getClient,
  testConnection
};