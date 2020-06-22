Overview
--------
`fsec` is derived from `forward-secrecy`

> `forward-secrecy` is a simple implementation of the Axolotl key-ratcheting protocol written in Javascript. It uses NaCl (in this case, [TweetNacl](https://github.com/dchest/tweetnacl-js)) for encryption, meaning sessions are secured with Curve25519 keys and Salsa20 encryption.
which can be found @ https://github.com/alax/forward-secrecy

`fsec` aims to become a fully contained, easy to read, test and expand, implementation of the omemo protocol.

Milestones
--------

**current:**
 
* 8-10 june 2017:  forward-secrecy forked, built and tested 
* 11 june 2017: reading axolotl/olm spec as well as further omemo protocol inspection to identify missing pieces
```diff
- encountered Error with node-machine-id package - see output:  https://gist.github.com/Shokodemon/5148d0dafb27fa6427cbc28c52ee8416
+ must fix package before proceeding so that we can grab a deviceId for omemo
+ 18:00 forking, fixing and sending a pull request.
+ 20:00 issue fixed, sent a pull request to author.
```
**upcoming**

* 11-18 june 2017: fsec gets prepared to implement omemo by creating a skeleton of missing functions between axolotl/olm and omemo.

**future 1**
19 june onwards

* implementing said functions

**future 2**

* implementing tests for the added functions

**future 3**

* adding xmpp layer, look into the possibility of protocol modularity to see if an omemo session can benefit something else other than xmpp.

projected preliminary completion date
----------
august 30th.

future of fsec
----------

* solicit auditing to make sure fsec is safe for critical applications
* module maintenance
* move from pbkdf2-sha256 to pbkdf2 node module in order to use sha512 hmac.
* maintenance as open source project
* maintenance as a crypto pedagogical resource

es6-plato output on the project @ june 2017
---------
```bash
report ---> ModuleReport {
  methodAggregate: 
   AggregateMethodReport {
     methodAggregate: undefined,
     cyclomatic: 52,
     cyclomaticDensity: 22.222,
     halstead: 
      HalsteadData {
        bugs: 4.827,
        difficulty: 86.821,
        effort: 1257319.965,
        length: 1891,
        time: 69851.109,
        vocabulary: 202,
        volume: 14481.678,
        operands: [Object],
        operators: [Object] },
     params: 34,
     sloc: { logical: 234, physical: 824 } },
  settings: 
   { commonjs: false,
     dependencyResolver: undefined,
     forin: false,
     logicalor: true,
     switchcase: true,
     trycatch: false,
     newmi: false },
  classes: 
   [ ClassReport {
       methodAggregate: [Object],
       errors: [],
       lineEnd: 824,
       lineStart: 4,
       methods: [Object],
       methodAverage: [Object],
       name: '<anonymous>',
       maintainability: 110.608 } ],
  dependencies: 
   [ { line: 1, path: 'tweetnacl', type: 'esm' },
     { line: 2, path: './utils', type: 'esm' } ],
  errors: [],
  filePath: undefined,
  lineEnd: 824,
  lineStart: 1,
  maintainability: 110.608,
  methods: [],
  methodAverage: 
   MethodAverage {
     cyclomatic: 2.417,
     cyclomaticDensity: 45.861,
     halstead: 
      HalsteadAverage {
        bugs: 0.091,
        difficulty: 6.356,
        effort: 6330.063,
        length: 50.972,
        time: 351.67,
        vocabulary: 17.417,
        volume: 273.224,
        operands: [Object],
        operators: [Object] },
     params: 0.944,
     sloc: { logical: 6.472, physical: 28.5 } },
  srcPath: undefined,
  srcPathAlias: undefined,
  module: 'src/index.js',
  aggregate: 
   { complexity: 
      { methodAggregate: undefined,
        cyclomatic: 52,
        cyclomaticDensity: 22.222,
        halstead: [Object],
        params: 34,
        sloc: [Object] } },
  functions: [] }
```
