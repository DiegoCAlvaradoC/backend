// scripts/poblarDatosHistoricos.js
// Script para poblar la base de datos con datos históricos realistas
// Basado en el Excel SEGUIMIENTO_DE_INSCRITOS_I-2025

const { Pool } = require('pg');

// Configuración de conexión
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'ucb_admissions',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin'
});

// Datos de referencia del Excel I-2025
const DISTRIBUCION_CARRERAS = [
    { nombre: 'Ingeniería de Sistemas', porcentaje: 0.28 },
    { nombre: 'Medicina', porcentaje: 0.23 },
    { nombre: 'Derecho', porcentaje: 0.18 },
    { nombre: 'Administración de Empresas', porcentaje: 0.15 },
    { nombre: 'Psicología', porcentaje: 0.08 },
    { nombre: 'Arquitectura', porcentaje: 0.05 },
    { nombre: 'Contaduría Pública', porcentaje: 0.03 }
];

const COLEGIOS = [
    { nombre: 'San Calixto', tipo: 'PARTICULAR' },
    { nombre: 'Don Bosco', tipo: 'PARTICULAR' },
    { nombre: 'La Salle', tipo: 'PARTICULAR' },
    { nombre: 'Fe y Alegría', tipo: 'PARTICULAR' },
    { nombre: 'Ayacucho', tipo: 'PARTICULAR' },
    { nombre: 'Sagrados Corazones', tipo: 'PARTICULAR' },
    { nombre: 'San Ignacio', tipo: 'PARTICULAR' },
    { nombre: 'Alemán', tipo: 'PARTICULAR' },
    { nombre: 'Calvert', tipo: 'PARTICULAR' },
    { nombre: 'Franco Boliviano', tipo: 'PARTICULAR' },
    { nombre: 'Simón Bolívar', tipo: 'FISCAL' },
    { nombre: 'Bernardino Sanjinés', tipo: 'FISCAL' },
    { nombre: 'Gualberto Villarroel', tipo: 'FISCAL' },
    { nombre: 'Eduardo Abaroa', tipo: 'FISCAL' },
    { nombre: 'República de Alemania', tipo: 'FISCAL' },
    { nombre: 'CEMA 1', tipo: 'CEMA' },
    { nombre: 'CEMA 2', tipo: 'CEMA' },
    { nombre: 'CEMA 3', tipo: 'CEMA' }
];

const PERIODOS = [
    { nombre: 'I-2021', descripcion: 'Primer Semestre 2021', fecha_inicio: '2020-11-01', fecha_fin: '2021-01-31', cantidad: 65 },
    { nombre: 'II-2021', descripcion: 'Segundo Semestre 2021', fecha_inicio: '2021-05-01', fecha_fin: '2021-07-31', cantidad: 70 },
    { nombre: 'I-2022', descripcion: 'Primer Semestre 2022', fecha_inicio: '2021-11-01', fecha_fin: '2022-01-31', cantidad: 76 },
    { nombre: 'II-2022', descripcion: 'Segundo Semestre 2022', fecha_inicio: '2022-05-01', fecha_fin: '2022-07-31', cantidad: 82 },
    { nombre: 'I-2023', descripcion: 'Primer Semestre 2023', fecha_inicio: '2022-11-01', fecha_fin: '2023-01-31', cantidad: 89 },
    { nombre: 'II-2023', descripcion: 'Segundo Semestre 2023', fecha_inicio: '2023-05-01', fecha_fin: '2023-07-31', cantidad: 96 },
    { nombre: 'I-2024', descripcion: 'Primer Semestre 2024', fecha_inicio: '2023-11-01', fecha_fin: '2024-01-31', cantidad: 104 },
    { nombre: 'II-2024', descripcion: 'Segundo Semestre 2024', fecha_inicio: '2024-05-01', fecha_fin: '2024-07-31', cantidad: 112 }
];

const CIUDADES = ['La Paz', 'El Alto', 'Cochabamba', 'Santa Cruz', 'Oruro'];
const NOMBRES = [
    'Juan', 'María', 'Carlos', 'Ana', 'Luis', 'Sofia', 'Pedro', 'Laura',
    'Diego', 'Valentina', 'Miguel', 'Camila', 'José', 'Isabella', 'Daniel',
    'Martina', 'Ricardo', 'Lucía', 'Fernando', 'Gabriela'
];
const APELLIDOS = [
    'García', 'Rodríguez', 'López', 'Martínez', 'González', 'Pérez', 'Sánchez',
    'Ramírez', 'Torres', 'Flores', 'Morales', 'Jiménez', 'Díaz', 'Cruz'
];

// Utilidades
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generarCI(base) {
    return `${base}${Math.floor(Math.random() * 10000)} LP`;
}

function generarEmail(nombre, apellido, contador) {
    return `${nombre.toLowerCase()}.${apellido.toLowerCase()}${contador}@ucb.edu.bo`;
}

function generarTelefono() {
    return `7${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
}

function generarEstado() {
    const rand = Math.random();
    if (rand < 0.65) return 'APROBADA';
    if (rand < 0.85) return 'PENDIENTE';
    if (rand < 0.95) return 'OBSERVADA';
    return 'RECHAZADA';
}

// Función principal
async function poblarDatos() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🚀 Iniciando población de datos históricos...\n');

        // 1. Insertar carreras
        console.log('📚 Insertando carreras...');
        for (const carrera of DISTRIBUCION_CARRERAS) {
            await client.query(
                `INSERT INTO carreras (nombre_carrera) VALUES ($1) ON CONFLICT (nombre_carrera) DO NOTHING`,
                [carrera.nombre]
            );
        }
        console.log('✅ Carreras insertadas\n');

        // 2. Insertar colegios
        console.log('🏫 Insertando colegios...');
        for (const colegio of COLEGIOS) {
            await client.query(
                `INSERT INTO colegios (nombre, tipo) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING`,
                [colegio.nombre, colegio.tipo]
            );
        }
        console.log('✅ Colegios insertados\n');

        // 3. Insertar usuario admin (si no existe)
        console.log('👤 Verificando usuario admin...');
        await client.query(
            `INSERT INTO usuarios (nombre_usuario, contrasena, rol) 
       VALUES ('admin', '$2b$10$rU0QwjZ3hEOFvvI1YFxHteZOPEZfzOvXE8pDqR9YhJ0Z8fPQwZvYm', 'ADMINISTRADOR')
       ON CONFLICT (nombre_usuario) DO NOTHING`
        );
        const adminResult = await client.query(`SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'admin'`);
        const adminId = adminResult.rows[0].id_usuario;
        console.log('✅ Usuario admin verificado\n');

        // 4. Obtener IDs de carreras y colegios
        const carrerasResult = await client.query('SELECT id_carrera, nombre_carrera FROM carreras');
        const carrerasMap = {};
        carrerasResult.rows.forEach(row => {
            carrerasMap[row.nombre_carrera] = row.id_carrera;
        });

        const colegiosResult = await client.query('SELECT id_colegio FROM colegios');
        const colegiosIds = colegiosResult.rows.map(r => r.id_colegio);

        // 5. Generar datos por período
        let contadorGlobal = 1;

        for (const periodo of PERIODOS) {
            console.log(`📊 Generando datos para ${periodo.nombre} (${periodo.cantidad} postulantes)...`);

            // Insertar período
            const periodoResult = await client.query(
                `INSERT INTO periodos_inscripcion (nombre, descripcion, fecha_inicio, fecha_fin, estado)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT DO NOTHING
         RETURNING id_periodo`,
                [periodo.nombre, periodo.descripcion, periodo.fecha_inicio, periodo.fecha_fin]
            );

            // Si ya existe, obtener el ID
            let periodoId;
            if (periodoResult.rows.length > 0) {
                periodoId = periodoResult.rows[0].id_periodo;
            } else {
                const existingPeriodo = await client.query(
                    'SELECT id_periodo FROM periodos_inscripcion WHERE nombre = $1',
                    [periodo.nombre]
                );
                periodoId = existingPeriodo.rows[0].id_periodo;
            }

            // Generar postulantes por carrera
            for (const carrera of DISTRIBUCION_CARRERAS) {
                const cantidadCarrera = Math.round(periodo.cantidad * carrera.porcentaje);
                const carreraId = carrerasMap[carrera.nombre];

                for (let i = 0; i < cantidadCarrera; i++) {
                    const nombre = randomElement(NOMBRES);
                    const apellido = randomElement(APELLIDOS);
                    const ci = generarCI(7000000 + contadorGlobal);
                    const email = generarEmail(nombre, apellido, contadorGlobal);
                    const telefono = generarTelefono();
                    const colegioId = randomElement(colegiosIds);
                    const ciudad = randomElement(CIUDADES);

                    // Insertar postulante
                    const postulanteResult = await client.query(
                        `INSERT INTO postulantes (nombre, ci, nacionalidad, ciudad_procedencia, colegio_id, id_carrera, email, telefono)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id_postulante`,
                        [`${nombre} ${apellido}`, ci, 'Boliviana', ciudad, colegioId, carreraId, email, telefono]
                    );

                    const postulanteId = postulanteResult.rows[0].id_postulante;

                    // Insertar preinscripción
                    const estado = generarEstado();
                    const fechaRegistro = new Date(periodo.fecha_inicio);
                    fechaRegistro.setDate(fechaRegistro.getDate() + Math.floor(Math.random() * 60));

                    await client.query(
                        `INSERT INTO preinscripciones (postulante_id, periodo_id, creada_por_id, fecha_registro, estado, resumen_datos)
             VALUES ($1, $2, $3, $4, $5, $6)`,
                        [postulanteId, periodoId, adminId, fechaRegistro, estado, 'Datos completos - Generado automáticamente']
                    );

                    contadorGlobal++;
                }
            }

            console.log(`   ✅ ${periodo.cantidad} postulantes generados para ${periodo.nombre}`);
        }

        await client.query('COMMIT');

        console.log('\n🎉 ¡Datos históricos generados exitosamente!');
        console.log(`📈 Total de postulantes generados: ${contadorGlobal - 1}`);

        // Verificación
        console.log('\n📊 RESUMEN POR PERÍODO:');
        const resumen = await client.query(`
      SELECT 
        pi.nombre as periodo,
        COUNT(p.id_preinscripcion) as total,
        COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas,
        COUNT(CASE WHEN p.estado = 'PENDIENTE' THEN 1 END) as pendientes,
        COUNT(CASE WHEN p.estado = 'OBSERVADA' THEN 1 END) as observadas,
        COUNT(CASE WHEN p.estado = 'RECHAZADA' THEN 1 END) as rechazadas
      FROM periodos_inscripcion pi
      LEFT JOIN preinscripciones p ON pi.id_periodo = p.periodo_id
      GROUP BY pi.nombre, pi.fecha_inicio
      ORDER BY pi.fecha_inicio
    `);

        console.table(resumen.rows);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Ejecutar
if (require.main === module) {
    poblarDatos()
        .then(() => {
            console.log('\n✅ Script completado exitosamente');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Error ejecutando script:', error);
            process.exit(1);
        });
}

module.exports = { poblarDatos };