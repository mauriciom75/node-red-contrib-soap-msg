module.exports = function (RED) {
    function SoapCall(n) {
        var soap = require('soap');
        var request = require('request');
        RED.nodes.createNode(this, n);
        this.topic = n.topic;
        this.name = n.name;
        this.wsdl = n.wsdl;
        this.server = RED.nodes.getNode(this.wsdl);
        this.method = n.method;
        this.payload = n.payload;
        var node = this;
        this.status({});

        try {
            node.on('input', function (msg) {
                var server = (msg.server)?{wsdl:msg.server, auth:0}:node.server;
                var lastFiveChar = server.wsdl.substr(server.wsdl.length-5);
                if(lastFiveChar !== '?wsdl'){
                    server.wsdl += '?wsdl';
                };
                if ( msg.options.request )
                {
                  request_with_defaults = request.defaults(msg.options.request);
                  msg.options.request = request_with_defaults;
                }
                soap.createClient(server.wsdl, msg.options||{}, function (err, client) {
                    if (err) {
                        node.status({fill: "red", shape: "dot", text: "WSDL Config Error: " + err});
                        node.error("WSDL Config Error: " + err);
                        return;
                    }

                    //console.log("_wsdlCache : " + JSON.stringify(soap._wsdlCache));
                    switch (node.server.auth) {
                        case '1':
                            client.setSecurity(new soap.BasicAuthSecurity(server.user, server.pass));
                            break;
                        case '2':
                            client.setSecurity(new soap.ClientSSLSecurity(server.key, server.cert, {}));
                            break;
                        case '3':
                            client.setSecurity(new soap.WSSecurity(server.user, server.pass));
                            break;
                        case '4':
                            client.setSecurity(new soap.BearerSecurity(server.token));
                            break;
                    }
                    node.status({fill: "yellow", shape: "dot", text: "SOAP Request..."});
                    if(msg.headers){
                        client.addSoapHeader(msg.headers);
                    }
                    client.on('33soapError', function (error) {
                        // no es un error de formato. El body se parseó ok.
                        // Solo indica que hubo error soap que puede ser de negocio.
                        console.log( " ----- Se produjo un error : " + JSON.stringify(error) );
                        console.log( " ----- ");

                        msg.payload = JSON.parse(JSON.stringify(error.root)); // el body en json
                        msg.soap_response = JSON.parse(JSON.stringify(error.response));
                        node.error("Service Call Error: " + err, msg);
                    });

                    if(client.hasOwnProperty(node.method)){
                        client[node.method](msg.payload, function (err, result) {
                            if (err) {
                                node.status({fill: "red", shape: "dot", text: "Service Call Error: " + err});
                                msg.payload = null;
                                msg.headers = null;
                                if (err.root.Envelope.Body) msg.payload = JSON.parse(JSON.stringify(err.root.Envelope.Body));
                                if (err.root.Envelope.Header) msg.headers = JSON.parse(JSON.stringify(err.root.Envelope.Header));
                                msg.soap_result = JSON.parse(JSON.stringify(result));
                                node.error("Service Call Error: " + err, msg);
                                return;
                            }
                            node.status({fill:"green", shape:"dot", text:"SOAP result received"});

                            msg.payload = result;
                            node.send(msg);
                        });
                    } else {
                        node.status({fill:"red", shape:"dot", text:"Method does not exist"});
                        node.error("Method does not exist!");
                    };
                });
            });
        } catch (err) {
            node.status({fill: "red", shape: "dot", text: err.message});
            node.error(err.message);
        }
    }
    RED.nodes.registerType("soap request", SoapCall);
};
