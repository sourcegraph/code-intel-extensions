# Code intelligence for TypeScript/JavaScript

![TypeScript code intelligence](https://user-images.githubusercontent.com/133014/63376874-a92c7900-c343-11e9-98bb-631016f1eff7.gif)

A Sourcegraph extension that provides code intelligence for TypeScript/JavaScript.

## Usage with private Sourcegraph instances

This extension is configured to talk to a language server over WebSockets. If you are running a
private Sourcegraph instance, you should run your own language server. The server is available as a
Docker image `sourcegraph/lang-typescript` from Docker Hub.

### 🔐 Secure deployment 🔐

If you have private code, we recommend deploying the language server behind an
auth proxy (such as the example below using HTTP basic authentication in NGINX), a firewall, or a VPN.

### HTTP basic authentication

You can prevent unauthorized access to the language server by enforcing HTTP basic authentication in nginx, which comes with the sourcegraph/server image. At a high level, you'll create a secret then put it in both the nginx config and in your Sourcegraph global settings so that logged-in users are authenticated when their browser makes requests to the TypeScript language server.

Here's how to set it up:

Create an `.htpasswd` file in the Sourcegraph config directory with one entry:

```
$ htpasswd -c ~/.sourcegraph/config/.htpasswd langserveruser
New password:
Re-type new password:
Adding password for user langserveruser
```

Add a location directive the [nginx.conf](https://docs.sourcegraph.com/admin/nginx) that will route requests to the TypeScript language server:

```nginx
...
http {
    ...
    server {
        ...
        location / {
            ...
        }

        location /typescript {
            proxy_pass http://host.docker.internal:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";

            auth_basic "basic authentication is required to access the language server";
            auth_basic_user_file /etc/sourcegraph/.htpasswd;
        }
    }
}
```

-   If you're running the quickstart on Linux, change `host.docker.internal` to the output of `ip addr show docker0 | grep -Po 'inet \K[\d.]+'`.
-   If you're using [Kubernetes](#using-kubernetes) (e.g. [deploy-sourcegraph](https://github.com/sourcegraph/deploy-sourcegraph)), change `host.docker.internal` to `lang-typescript`.

Add these to your Sourcegraph global settings:

```
  "typescript.serverUrl": "ws://langserveruser:PASSWORD@host.docker.internal:7080/typescript",
  "typescript.sourcegraphUrl": "http://host.docker.internal:7080",
```

Fill in the `PASSWORD` that you created above.

-   If you're running the quickstart on Linux, change `host.docker.internal` to the output of `ip addr show docker0 | grep -Po 'inet \K[\d.]+'`.
-   If you're using [Kubernetes](#using-kubernetes) (e.g. [deploy-sourcegraph](https://github.com/sourcegraph/deploy-sourcegraph)):
    -   `typescript.serverUrl` is the address of the TypeScript language server from the perspective of a user's browser (e.g. https://sourcegraph.example.com/typescript)
    -   `typescript.sourcegraphUrl` is the address of the Sourcegraph instance from the perspective of the TypeScript language server (e.g. http://sourcegraph-frontend:30080)

Finally, restart the sourcegraph/server container (or nginx deployment if deployed to Kubernetes) to pick up the configuration change.

After deploying the language server, unauthenticated access to `http://localhost:7080/typescript` (or https://sourcegraph.example.com/typescript) should be blocked, but code intelligence should work when you're logged in.

You can always revoke the `PASSWORD` by deleting the `.htpasswd` file and restarting nginx.

### Using Docker

1.  Run the server listening on `ws://localhost:8080`:

    ```sh
    docker run -p 8080:8080 sourcegraph/lang-typescript
    ```

1.  In your Sourcegraph settings, set `typescript.serverUrl` to tell the extension where to connect to the server:

    ```json
    "typescript.serverUrl": "ws://localhost:8080"
    ```

1.  If the URL the server should use to connect to Sourcegraph is different from the end-user URL, set `typescript.sourcegraphUrl`:

    ```json
    "typescript.sourcegraphUrl": "http://host.docker.internal:7080",
    ```

    The above value works for macOS when running the server in a local Docker container. If you're
    running locally on Linux, use the value emitted by this command:

    ```bash
    ip addr show docker0 | grep -Po 'inet \K[\d.]+'
    ```

    The port should match that of the `docker run` command running Sourcegraph.

#### TLS in Docker

To enable the use of Websocket with SSL pass the key/certificate pair as environment variables to the docker container.

```
docker run -p 8080:8080 -e TLS_KEY="$(cat sourcegraph.example.com.key)" -e TLS_CERT="$(cat sourcegraph.example.com.crt)" sourcegraph/lang-typescript
```

To reuse the self-signed certificate created by following the steps [here](https://docs.sourcegraph.com/admin/nginx#tls-https) add these parameters to the run command above:

```
-e NODE_EXTRA_CA_CERTS=/home/node/sourcegraph.example.com.crt -v ~/.sourcegraph/config:/home/node
```

The self signed certificate's `Common Name (CN)` should be the host name of your host. Also make sure you use Websocket with SSL in your Sourcegraph settings to connect to the language server:

```json
"typescript.serverUrl": "wss://localhost:8080"
```

### Authentication proxies and firewalls

Some customers deploy Sourcegraph behind an authentication proxy or firewall. If you do this, we
recommend deploying the language server behind the proxy so that it can issue requests directly to
Sourcegraph without going through the proxy. (Otherwise, you will need to configure the language
server to authenticate through your proxy.) Make sure you set `typescript.sourcegraphUrl` to the URL
that the language server should use to reach Sourcegraph, which is likely different from the URL
that end users use.

### Using Kubernetes

If you want to deploy the language server with Kubernetes, your deployment should look like this:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
    name: lang-typescript
spec:
    replicas: 4 # adjust as needed
    selector:
        matchLabels:
            app: lang-typescript
    template:
        metadata:
            labels:
                app: lang-typescript
        spec:
            containers:
                - name: lang-typescript
                  image: sourcegraph/lang-typescript
                  ports:
                      - containerPort: 8080
                        name: wss
                  env:
                      # TLS certificate and key to secure the WebSocket connection (optional)
                      - name: TLS_CERT
                        value: ... your TLS certificate ...
                      - name: TLS_KEY
                        value: ... your TLS key ...
                  # Resources to provision for the server (adjust as needed)
                  resources:
                      limits:
                          cpu: '4'
                          memory: 5Gi
                      requests:
                          cpu: 500m
                          memory: 2Gi
                  # Probes the server periodically to see if it is healthy
                  livenessProbe:
                      initialDelaySeconds: 30
                      tcpSocket:
                          port: wss
                      timeoutSeconds: 5
                  readinessProbe:
                      tcpSocket:
                          port: wss
```

With a corresponding service:

```yaml
apiVersion: v1
kind: Service
metadata:
    labels:
        app: lang-typescript
        deploy: lang-typescript
    name: lang-typescript
spec:
    ports:
        - name: wss
          port: 443
          targetPort: wss
    selector:
        app: lang-typescript
    type: LoadBalancer
```

#### TLS

TLS is optional but recommended for production deployments. It is used if `TLS_KEY` and `TLS_CERT` environment variables are set.

#### Enabling OpenTracing

The server can report spans through OpenTracing to diagnose issues.
If the environment variable `LIGHTSTEP_ACCESS_TOKEN` is set, the server will send tracing data to the given LightStep instance.
Support for other OpenTracing implementations can easily added here.

```diff
  env:
+   - name: LIGHTSTEP_ACCESS_TOKEN
+     value: abcdefg
```

#### Enabling Prometheus metrics

The server exposes metrics on port 6060 that can be scraped by Prometheus.

#### Improving performance with an SSD

To improve performance of dependency installation, the server can be configured to use a mounted SSD at a given directory by setting the `CACHE_DIR` environment variable. The instructions for how to mount a SSD depend on your deployment environment.

1. Add a volume for the mount path of the SSD:

    ```diff
      spec:
    + volumes:
    +   - hostPath:
    +       path: /path/to/mounted/ssd
    +     name: cache-ssd
    ```

    For example, Google Cloud Platform mounts the first SSD disk to `/mnt/disks/ssd0`.

2. Add a volume mount to the container spec:

    ```diff
      image: sourcegraph/lang-typescript
    + volumeMounts:
    +   - mountPath: /mnt/cache
    +     name: cache-ssd
    ```

3. Tell the language server to use the mount as the root for temporary directories:

    ```diff
      env:
    +   - name: CACHE_DIR
    +     value: /mnt/cache
    ```

#### Improving performance with an npm registry proxy

To further speed up dependency installation, all npm registry requests can be proxied through a cache running on the same node.

Example deployment for Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
    name: npm-proxy
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
                app: npm-proxy
        spec:
            containers:
                - image: sourcegraph/npm-proxy:latest
                  name: npm-proxy
                  ports:
                      - containerPort: 8080
                        name: http
                  resources:
                      limits:
                          cpu: '1'
                          memory: 1Gi
                  volumeMounts:
                      - mountPath: /cache
                        name: npm-proxy-cache
            volumes:
                - name: npm-proxy-cache
                  persistentVolumeClaim:
                      claimName: npm-proxy
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
    annotations:
        volume.beta.kubernetes.io/storage-class: default
    name: npm-proxy
spec:
    accessModes:
        - ReadWriteOnce
    resources:
        requests:
            storage: 100Gi
---
apiVersion: v1
kind: Service
metadata:
    labels:
        app: npm-proxy
    name: npm-proxy
spec:
    ports:
        - name: http
          port: 8080
          targetPort: http
    selector:
        app: npm-proxy
    type: ClusterIP
```

Then define a `.yarnrc` as a config map that points to the proxy:

```yaml
apiVersion: v1
data:
    .yarnrc: |
        # THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
        # yarn lockfile v1


        https-proxy "http://npm-proxy:8080"
        proxy "http://npm-proxy:8080"
        strict-ssl false
kind: ConfigMap
metadata:
    name: yarn-config
```

and mount it into the container:

```diff
  name: lang-typescript
+ volumeMounts:
+  - mountPath: /yarn-config
+    name: yarn-config
```

```diff
  spec:
+   volumes:
+     - configMap:
+         name: yarn-config
+       name: yarn-config
```

## Configuration

### Support for dependencies on private packages and git repositories

Dependencies on private npm packages and private registries is supported by setting the `typescript.npmrc` setting.
It contains the same key/value settings as your `.npmrc` file in your home folder, and therefor supports the same scoping to registries and package scopes.
See https://docs.npmjs.com/misc/config#config-settings for more information on what is possible to configure in `.npmrc`.

Example:

```json
"typescript.npmrc": {
  "//registry.npmjs.org/:_authToken": "asfdh21e-1234-asdn-123v-1234asdb2"
}
```

For dependencies on private git repositories, mount an SSH key into `~/.ssh`.
