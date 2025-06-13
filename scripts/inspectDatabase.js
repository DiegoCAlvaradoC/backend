// scripts/inspectDatabase.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'ucb_admissions',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin',
});

/**
 * Script para inspeccionar la estructura actual de la base de datos
 */
class DatabaseInspector {
    
    /**
     * Obtener todas las tablas de la base de datos
     */
    async getTables() {
        const query = `
            SELECT 
                table_name,
                table_type,
                table_schema
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `;
        
        try {
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('Error obteniendo tablas:', error);
            throw error;
        }
    }
    
    /**
     * Obtener estructura de una tabla específica
     */
    async getTableStructure(tableName) {
        const query = `
            SELECT 
                column_name,
                data_type,
                character_maximum_length,
                is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns 
            WHERE table_name = $1 
            AND table_schema = 'public'
            ORDER BY ordinal_position;
        `;
        
        try {
            const result = await pool.query(query, [tableName]);
            return result.rows;
        } catch (error) {
            console.error(`Error obteniendo estructura de ${tableName}:`, error);
            throw error;
        }
    }
    
    /**
     * Obtener restricciones de una tabla
     */
    async getTableConstraints(tableName) {
        const query = `
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.table_name = $1
            AND tc.table_schema = 'public';
        `;
        
        try {
            const result = await pool.query(query, [tableName]);
            return result.rows;
        } catch (error) {
            console.error(`Error obteniendo restricciones de ${tableName}:`, error);
            throw error;
        }
    }
    
    /**
     * Obtener índices de una tabla
     */
    async getTableIndexes(tableName) {
        const query = `
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes 
            WHERE tablename = $1
            AND schemaname = 'public';
        `;
        
        try {
            const result = await pool.query(query, [tableName]);
            return result.rows;
        } catch (error) {
            console.error(`Error obteniendo índices de ${tableName}:`, error);
            throw error;
        }
    }
    
    /**
     * Generar reporte completo de la base de datos
     */
    async generateFullReport() {
        try {
            console.log('🔍 INSPECCIONANDO BASE DE DATOS UCB_ADMISSIONS');
            console.log('='.repeat(60));
            
            // Obtener todas las tablas
            const tables = await this.getTables();
            console.log(`\n📊 TABLAS ENCONTRADAS (${tables.length}):`);
            console.log('-'.repeat(40));
            
            const report = {
                database: process.env.DB_NAME || 'ucb_admissions',
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5433,
                tables: []
            };
            
            for (const table of tables) {
                console.log(`\n🗂️  TABLA: ${table.table_name.toUpperCase()}`);
                console.log(`   Tipo: ${table.table_type}`);
                
                // Estructura de columnas
                const columns = await this.getTableStructure(table.table_name);
                console.log(`   Columnas (${columns.length}):`);
                
                const tableInfo = {
                    name: table.table_name,
                    type: table.table_type,
                    columns: [],
                    constraints: [],
                    indexes: []
                };
                
                columns.forEach(col => {
                    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
                    const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
                    const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
                    
                    console.log(`     - ${col.column_name}: ${col.data_type}${maxLength} ${nullable}${defaultValue}`);
                    
                    tableInfo.columns.push({
                        name: col.column_name,
                        type: col.data_type,
                        maxLength: col.character_maximum_length,
                        nullable: col.is_nullable === 'YES',
                        default: col.column_default,
                        position: col.ordinal_position
                    });
                });
                
                // Restricciones
                const constraints = await this.getTableConstraints(table.table_name);
                if (constraints.length > 0) {
                    console.log(`   Restricciones (${constraints.length}):`);
                    constraints.forEach(constraint => {
                        console.log(`     - ${constraint.constraint_type}: ${constraint.constraint_name}`);
                        if (constraint.foreign_table_name) {
                            console.log(`       Referencias: ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
                        }
                        
                        tableInfo.constraints.push({
                            name: constraint.constraint_name,
                            type: constraint.constraint_type,
                            column: constraint.column_name,
                            foreignTable: constraint.foreign_table_name,
                            foreignColumn: constraint.foreign_column_name
                        });
                    });
                }
                
                // Índices
                const indexes = await this.getTableIndexes(table.table_name);
                if (indexes.length > 0) {
                    console.log(`   Índices (${indexes.length}):`);
                    indexes.forEach(index => {
                        console.log(`     - ${index.indexname}`);
                        tableInfo.indexes.push({
                            name: index.indexname,
                            definition: index.indexdef
                        });
                    });
                }
                
                report.tables.push(tableInfo);
                console.log('-'.repeat(40));
            }
            
            // Generar análisis de relaciones
            console.log('\n🔗 ANÁLISIS DE RELACIONES:');
            console.log('-'.repeat(40));
            
            const relationships = [];
            report.tables.forEach(table => {
                table.constraints.forEach(constraint => {
                    if (constraint.type === 'FOREIGN KEY' && constraint.foreignTable) {
                        const relationship = `${table.name}.${constraint.column} → ${constraint.foreignTable}.${constraint.foreignColumn}`;
                        console.log(`   ${relationship}`);
                        relationships.push(relationship);
                    }
                });
            });
            
            report.relationships = relationships;
            
            // Guardar reporte en archivo JSON
            const fs = require('fs');
            const reportPath = './database-structure.json';
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`\n✅ Reporte guardado en: ${reportPath}`);
            
            return report;
            
        } catch (error) {
            console.error('❌ Error generando reporte:', error);
            throw error;
        }
    }
    
    /**
     * Verificar conectividad
     */
    async testConnection() {
        try {
            const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
            console.log('✅ Conexión exitosa a PostgreSQL');
            console.log(`   Tiempo servidor: ${result.rows[0].current_time}`);
            console.log(`   Versión: ${result.rows[0].db_version.split(' ')[0]} ${result.rows[0].db_version.split(' ')[1]}`);
            return true;
        } catch (error) {
            console.error('❌ Error de conexión:', error.message);
            return false;
        }
    }
    
    /**
     * Cerrar conexión
     */
    async close() {
        await pool.end();
    }
}

/**
 * Función principal para ejecutar la inspección
 */
async function main() {
    const inspector = new DatabaseInspector();
    
    try {
        // Probar conexión
        const connected = await inspector.testConnection();
        if (!connected) {
            console.log('\n💡 Verifica tu configuración en el archivo .env:');
            console.log('   DB_HOST=localhost');
            console.log('   DB_PORT=5433');
            console.log('   DB_NAME=ucb_admissions');
            console.log('   DB_USER=postgres');
            console.log('   DB_PASSWORD=admin');
            return;
        }
        
        // Generar reporte completo
        await inspector.generateFullReport();
        
        console.log('\n🎯 SIGUIENTE PASO:');
        console.log('   Revisa el archivo database-structure.json generado');
        console.log('   y compártelo para adaptar las APIs a tu estructura actual.');
        
    } catch (error) {
        console.error('Error en inspección:', error);
    } finally {
        await inspector.close();
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = DatabaseInspector;