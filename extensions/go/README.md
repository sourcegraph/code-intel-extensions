# Code intelligence for Go

This extension provides Go code intelligence on Sourcegraph.

[**🗃️ Source code**](https://github.com/sourcegraph/code-intel-extensions/tree/master/extensions/go)

![Go code intelligence](https://user-images.githubusercontent.com/1387653/49856504-ce281f80-fda4-11e8-933b-f8fc67c98daf.png)

## Usage

1. Enable the `sourcegraph/go` extension:
   - On Sourcegraph.com, visit the [extension page](https://sourcegraph.com/extensions/sourcegraph/go) to enable it.
   - On a self-hosted Sourcegraph instance, select **User menu > Extensions**, search for `sourcegraph/go`, and enable it.
1. Visit any Go code file on Sourcegraph.
1. Hover over a token in the code file.
   - See a description of the token.
   - Click **Go to definition** (if available) to go to the token's definition.
   - Click **Find references** to see all references to the token.

### On your code host

This extension adds the same features to code files and diffs on your code host if you're using the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension). To use it on your code host:

1. Follow the [usage steps](#usage) above to enable this extension.
1. Install the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension).
   - If you're using it with a self-hosted Sourcegraph instance, enter the Sourcegraph instance URL into the Sourcegraph browser extension options menu. Then click the gear icon and enable _Experimental features: Use extensions_.
1. Visit any file on your code host and hover over a token to see a description of the token, a **Go to definition** action (if available), and a **Find references** action.

## Search-based code intelligence

This extension comes with built-in code intelligence provided by [search-based heuristics](https://docs.sourcegraph.com/code_intelligence/explanations/basic_code_intelligence). Because this extension uses text-based heuristics, its definition and reference results are not precise:

- "Go to definition" on a token goes to the definition found by [universal-ctags](https://github.com/universal-ctags/ctags), a cross-language parsing suite.
- "Find references" on a token finds all instances of token (with the same case) in the current repository and other repositories.

These heuristics work well for tokens with unique names, such as `render_to_view` or `TLSConfig`. They do not work well for ambiguous tokens, such as `open` or `file`.

### Indexed and archived repositories

To include indexed and/or archived repositories in search results, add the following to your Sourcegraph global settings:

```json
  "basicCodeIntel.includeForks": true,
  "basicCodeIntel.includeArchives": true
```

### Large repositories

Search-based code intelligence will perform a search query in the commit you are viewing. This may cause performance issues if the commit is not indexed and the repository is large. After a timeout period with no results, an index-only search will be performed. This type of query may return results for a commit other than the one you are currently viewing. The default timeout period is five seconds, but can be lowered by adding the following to your Sourcegraph global settings (units are milliseconds):

```json
  "basicCodeIntel.unindexedSearchTimeout": 1000
```

For organizations that organize code in a monorepo, it may never be useful to perform an un-indexed search. To force only indexed search queries, add the following to your Sourcgraph global settings:

```json
  "basicCodeIntel.indexOnly": true
```

## LSIF

To enable [LSIF support](https://docs.sourcegraph.com/code_intelligence/explanations/precise_code_intelligence), add these to your Sourcegraph global settings:

```json
  "codeIntel.lsif": true
```

## Language server

This extension communicates with a language server over WebSockets. On Sourcegraph.com, this extension is already configured. If you are running a
private Sourcegraph instance, you should run your own language server. The server is available as a Docker image `sourcegraph/lang-go` from Docker Hub.

### 🔐 Secure deployment 🔐

If you have private code, we recommend deploying the language server behind an
auth proxy (such as the example below using HTTP basic authentication in NGINX), a firewall, or a VPN.

### HTTP basic authentication

You can prevent unauthorized access to the language server by enforcing HTTP basic authentication in nginx, which comes with the sourcegraph/server image. At a high level, you'll create a secret then put it in both the nginx config and in your Sourcegraph global settings so that logged-in users are authenticated when their browser makes requests to the Go language server.

Here's how to set it up:

Create an `.htpasswd` file in the Sourcegraph config directory with one entry:

```
$ htpasswd -c ~/.sourcegraph/config/.htpasswd langserveruser
New password:
Re-type new password:
Adding password for user langserveruser
```

Add a location directive the [nginx.conf](https://docs.sourcegraph.com/admin/nginx) that will route requests to the Go language server:

```nginx
...
http {
    ...
    server {
        ...
        location / {
            ...
        }

        location /go {
            proxy_pass http://host.docker.internal:4389;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";

            auth_basic "basic authentication is required to access the language server";
            auth_basic_user_file /etc/sourcegraph/.htpasswd;
        }
    }
}
```

- If you're running the quickstart on Linux, change `host.docker.internal` to the output of `ip addr show docker0 | grep -Po 'inet \K[\d.]+'`.
- If you're using [Kubernetes](#using-kubernetes) (e.g. [deploy-sourcegraph](https://github.com/sourcegraph/deploy-sourcegraph)), change `host.docker.internal` to `lang-go`.

Add these to your Sourcegraph global settings:

```
  "go.serverUrl": "ws://langserveruser:PASSWORD@example.host.docker.internal:7080/go",
  "go.sourcegraphUrl": "http://example.host.docker.internal:7080",
```

Fill in the `PASSWORD` that you created above.

- If you're running the quickstart on macOS, change `example.host.docker.internal` to `host.docker.internal`.
- If you're running the quickstart on Linux, change `example.host.docker.internal` to the output of `ip addr show docker0 | grep -Po 'inet \K[\d.]+'`.
- If you're using [Kubernetes](#using-kubernetes) (e.g. [deploy-sourcegraph](https://github.com/sourcegraph/deploy-sourcegraph)):
  - `go.serverUrl` is the address of the Go language server from the perspective of a user's browser (e.g. https://sourcegraph.example.com/go)
  - `go.sourcegraphUrl` is the address of the Sourcegraph instance from the perspective of the Go language server (e.g. http://sourcegraph-frontend:30080)

Finally, restart the sourcegraph/server container (or nginx deployment if deployed to Kubernetes) to pick up the configuration change.

After deploying the language server, unauthenticated access to `http://localhost:7080/go` (or https://sourcegraph.example.com/go) should be blocked, but code intelligence should work when you're logged in.

You can always revoke the `PASSWORD` by deleting the `.htpasswd` file and restarting nginx.

### Using Docker

1. Run the Go language server:

   ```sh
   docker run --rm --name lang-go -p 4389:4389 sourcegraph/lang-go \
     go-langserver -mode=websocket -addr=:4389 -usebuildserver -usebinarypkgcache=false -freeosmemory=false
   ```

   You can verify it's up and running with [`ws`](https://github.com/hashrocket/ws) (run this from the same machine your browser is running on):

   ```sh
   $ go get -u github.com/hashrocket/ws
   $ ws ws://localhost:4389
   >
   ```

1. Enable this extension on your Sourcegraph https://sourcegraph.example.com/extensions/sourcegraph/go

1. Add these to your Sourcegraph settings in https://sourcegraph.example.com/site-admin/global-settings and make sure the port matches either the Docker command or your Kubernetes config:

   ```sh
   "go.serverUrl": "ws://localhost:4389",
   "go.sourcegraphUrl": "http://host.docker.internal:7080",
   ```

   If you're running on Linux, change `go.sourcegraphUrl` to the IP given by:

   ```bash
   ip addr show docker0 | grep -Po 'inet \K[\d.]+'
   ```

Now visit a Go file and you should see code intelligence!

### Using Kubernetes

To deploy the language server with Kubernetes, use a deployment like this:

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  annotations:
    description: Go code intelligence provided by lang-go
  name: lang-go
  namespace: prod
spec:
  minReadySeconds: 10
  replicas: 1
  revisionHistoryLimit: 10
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: lang-go
    spec:
      containers:
        - args:
            - go-langserver
            - -mode=websocket
            - -addr=:4389
            - -usebuildserver
            - -usebinarypkgcache=false
            - -cachedir=$(CACHE_DIR)
            - -freeosmemory=false
          env:
            # TLS is optional
            - name: TLS_CERT
              valueFrom:
                secretKeyRef:
                  key: cert
                  name: tls
            - name: TLS_KEY
              valueFrom:
                secretKeyRef:
                  key: key
                  name: tls
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: CACHE_DIR
              value: /mnt/cache/$(POD_NAME)
          image: sourcegraph/lang-go:latest
          livenessProbe:
            initialDelaySeconds: 5
            tcpSocket:
              port: lsp
            timeoutSeconds: 5
          name: lang-go
          ports:
            - containerPort: 4389
              name: lsp
            - containerPort: 6060
              name: debug
          readinessProbe:
            tcpSocket:
              port: 4389
          resources:
            limits:
              cpu: '8'
              memory: 10G
            requests:
              cpu: '1'
              memory: 10G
          volumeMounts:
            - mountPath: /mnt/cache
              name: cache-ssd
      volumes:
        - hostPath:
            path: /mnt/disks/ssd0/pod-tmp
          name: cache-ssd
```

With a corresponding service:

```yaml
apiVersion: v1
kind: Service
metadata:
  annotations:
    prometheus.io/port: '6060'
    prometheus.io/scrape: 'true'
  labels:
    app: lang-go
  name: lang-go
  namespace: prod
spec:
  loadBalancerIP: your.static.ip.address
  ports:
    - name: debug
      port: 6060
      targetPort: debug
    - name: lsp
      port: 443
      targetPort: lsp
  selector:
    app: lang-go
  type: LoadBalancer
```

#### TLS

To enable TLS, set the `TLS_KEY` and `TLS_CERT` environment variables. TLS optional but **strongly recommended** for production deployments.

#### Scaling out by increasing the replica count

To run multiple instances of the go-langserver and distribute connections between them in Kubernetes, set `spec.replicas` in the deployment YAML:

```diff
 spec:
   minReadySeconds: 10
-  replicas: 1
+  replicas: 5
   revisionHistoryLimit: 10
```

## Support for dependencies on private git repositories

🚨 Before mounting your credentials into the language server, make sure the language server is hidden behind an auth proxy or firewall. 🚨

### Private dependencies via `.netrc`

Make sure your `$HOME/.netrc` contains:

```
machine codeload.github.com
login <your username>
password <your password OR access token>
```

Mount it into the container:

```
docker run ... -v "$HOME/.netrc":/root/.netrc ...
```

Verify fetching works:

```
$ docker exec -ti lang-go sh
# curl -n https://codeload.github.com/you/your-private-repo/zip/master
HTTP/1.1 200 OK
...
```

### Private dependencies via SSH keys

Make sure your `~/.gitconfig` contains these lines:

```
[url "git@github.com:"]
    insteadOf = https://github.com/
```

Mount that and your SSH keys into the container:

```
docker run ... -v "$HOME/.gitconfig":/root/.gitconfig -v "$HOME/.ssh":/root/.ssh ...
```

Verify cloning works:

```
$ docker exec -ti lang-go sh
# git clone https://github.com/you/your-private-repo
Cloning into 'your-private-repo'...
```

## Viewing communication between the browser and language server

This extension communicates from your browser to the language server that you deployed over WebSockets. This means that when you're viewing a code file on Sourcegraph, you can open the browser developer tools and refresh the page to capture the WebSocket connection and view the messages being sent and received:

![image](https://user-images.githubusercontent.com/1387653/53431623-c0e30000-39a5-11e9-963d-42260ca12de3.png)
