const bcrypt = require('bcrypt');

// Pega aquí el NUEVO hash que acabas de generar
const nuevoHash = '$2b$12$s1POSDeqAsRZEUP4Ud1N/e48Iew.DIlGSaqA/Ky0pegnEqi5365jS';

bcrypt.compare('admin123', nuevoHash).then(result => {
    console.log('¿Ahora coincide?', result);
    // Debe mostrar: true
    process.exit();
});