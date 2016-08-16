var HookedWeb3Provider = require('hooked-web3-provider');
var lightwallet = require('eth-signer');

var Signer = lightwallet.signer;
var HDSigner = lightwallet.signers.HDSigner;
var Phrase = lightwallet.generators.Phrase;
var ProxySigner = lightwallet.signers.ProxySigner;
var regularWeb3Provider = web3.currentProvider;

const SEED1 = 'tackle crystal drum type spin nest wine occur humor grocery worry pottery';
const SEED2 = 'tree clock fly receive mirror scissors away avoid seminar attract wife holiday';
const LOG_NUMBER_1 = 1234;
const LOG_NUMBER_2 = 2345;

contract("Uport proxy integration tests", (accounts) => {
  var identityFactory;
  var testReg;
  var proxy;
  var recoverableController;
  var recoveryQuorum;

  var proxySigner;
  var user1Signer;
  var user2Signer;
  var user1;
  var user2;
  var admin;

  // var neededSigs = 2;
  var shortTimeLock = 2;
  var longTimeLock = 5;

  before(() => {
    user1Signer = new HDSigner(Phrase.toHDPrivateKey(SEED1));
    user1 = user1Signer.getAddress();
    user2Signer = new HDSigner(Phrase.toHDPrivateKey(SEED2));
    user2 = user2Signer.getAddress();
    admin = accounts[0];
    delegates = [
        accounts[1],
        accounts[2]
    ];
    web3.eth.sendTransaction({from: admin, to: user1, value: web3.toWei(1000)});
    web3.eth.sendTransaction({from: admin, to: user2, value: web3.toWei(1000)});

    var web3Prov = new HookedWeb3Provider({
      host: 'http://localhost:8545',
      transaction_signer: new Signer(user1Signer),
    });
    web3.setProvider(web3Prov);
    // Truffle deploys contracts with accounts[0]
    identityFactory = IdentityFactory.deployed();
    testReg = TestRegistry.deployed();
  });

  it("Create proxy, controller, and recovery contracts", (done) => {
    var event = identityFactory.IdentityCreated({creator: user1})
    event.watch((error, result) => {
      proxy = Proxy.at(result.args.proxy);
      recoverableController = RecoverableController.at(result.args.controller);
      RecoveryQuorum.new(recoverableController.address, delegates, 2).then((newRQ) => {
        recoveryQuorum = newRQ;
        return recoverableController.changeRecoveryFromRecovery(recoveryQuorum.address, {from: admin});
      }).then(() => {
        done();
      });
    });
    identityFactory.CreateProxyWithControllerAndRecovery(user1, delegates, longTimeLock, shortTimeLock, {from: user1}).catch(done);
  });

  it("Use proxy for simple function call", (done) => {
    // Set up the new Proxy provider
    proxySigner = new Signer(new ProxySigner(proxy.address, user1Signer, recoverableController.address));
    var web3ProxyProvider = new HookedWeb3Provider({
      host: 'http://localhost:8545',
      transaction_signer: proxySigner
    });
    web3.setProvider(web3ProxyProvider);

    // Register a number from proxy.address
    testReg.register(LOG_NUMBER_1, {from: proxy.address}).then(() => {
      // Verify that the proxy address is logged
      return testReg.registry.call(proxy.address);
    }).then((regData) => {
      assert.equal(regData.toNumber(), LOG_NUMBER_1);
      done();
    }).catch(done);
  });

  it("Do a social recovery and do another function call", (done) => {
    // User regular web3 provider to send from regular accounts
    web3.setProvider(regularWeb3Provider);
    recoveryQuorum.signUserChange(user2, {from: delegates[0]})
    .then(() => {
      return recoveryQuorum.signUserChange(user2, {from: delegates[1]});
    }).then(() => {
      proxySigner = new Signer(new ProxySigner(proxy.address, user2Signer, recoverableController.address));
      var web3ProxyProvider = new HookedWeb3Provider({
        host: 'http://localhost:8545',
        transaction_signer: proxySigner
      });
      web3.setProvider(web3ProxyProvider);
      // Register a number from proxy.address
      return testReg.register(LOG_NUMBER_2, {from: proxy.address})
    }).then(() => {

      done();
    }).catch(done);
  });
});
