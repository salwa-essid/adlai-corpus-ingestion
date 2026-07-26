function info(message) {
    console.log(`[INFO] ${message}`)
}

function success(message) {
    console.log(`[SUCCESS] ${message}`)
}

// function error(message) {
//     console.error(`[ERROR] ${message}`)
// }

module.exports = {
    info,
    success
};