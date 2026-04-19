'use strict';

const path = require('path');
const { workspace, ExtensionContext } = require('vscode');
const {
  LanguageClient,
  TransportKind
} = require('vscode-languageclient/node');

let client;

function activate(context) {
  // Path to our language server script
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server.js')
  );

  // Server launch options
  const serverOptions = {
    run:   { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc }
  };

  // Tell the client which files to activate for
  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'gproms' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{gproms,gpl,txt}')
    }
  };

  // Create and start the client (which also starts the server)
  client = new LanguageClient(
    'gpromslanguageserver',
    'gPROMS Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

function deactivate() {
  if (!client) return undefined;
  return client.stop();
}

module.exports = { activate, deactivate };
