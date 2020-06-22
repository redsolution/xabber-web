import pbkdf2 from 'pbkdf2-sha256'
import crypto from 'crypto'
import nacl from 'tweetnacl'

export default new class {
    /**
     * Create an SHA256-HMAC from the specified key and data. Note that according
     * to this (http://stackoverflow.com/a/9591184) we can use buffers as key
     * material (as well as for data).
     *
     * @param {Buffer|String} key
     * @param {Buffer|String} data
     * @return {Buffer} digest
     */
    hmac (key, data) {
        return crypto
            .createHmac('sha256', key)
            .update(data)
            .digest()
    }

    /**
     * Key-derivation using PBKDF2.
     *
     * @param {Buffer|String} key
     * @param {Buffer|String} salt
     * @param {Number} iter - Number of iterations.
     * @param {Number} length - The length of the key material we require.
     * @return {Buffer}
     */
        kdf (key, salt, iter, length) {
            return pbkdf2(key, salt, iter, length)
        }
    /**
     * ECDH using Curve25519 (from NaCl).
     *
     * @param {Uint8Array} publicKey
     * @param {Uint8Array} secretKey
     * @return {Uint8Array} - The shared key.
     */
    dh (publicKey, secretKey) {
        return nacl.box.before(publicKey, secretKey)
    }
}
