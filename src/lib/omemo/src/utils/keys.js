import nacl from 'tweetnacl'

export default new class {
    /**
    * Generate a new key pair.
    *
    * @return {Object} - New NaCl key pair.
    */
    newPair () {
        return nacl.box.keyPair()
    }
}
