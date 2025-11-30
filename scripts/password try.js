const bcrypt = require('bcrypt');

const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TbFq3WYHr1P.eZzpDsGt4B2YZxsO';
const password = 'admin123';

bcrypt.compare(password, hash).then(result => {
    console.log('¿Coincide?', result);
    // Debe mostrar: true
    process.exit();
});