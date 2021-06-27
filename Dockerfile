FROM ubuntu:20.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get -y update && \
      buildDeps="ca-certificates \
                 apt-utils \
                 curl \
                 gcc \
                 make \
                 expat \
                 libexpat1-dev \
                 git \
                 erlang" && \
      apt-get install -y --no-install-recommends ${buildDeps} && \
      apt-get autoremove -y && \
      apt-get clean -y

RUN mkdir /app
WORKDIR /app

RUN mkdir ./xabber-websocket && \
      cd xabber-websocket && \
      curl -sL https://github.com/redsolution/xabber-websocket/archive/0.3.1.tar.gz | \
      tar -zx --strip-components=1 && \
      make

FROM ubuntu:20.04

RUN apt-get -y update && \
      buildDeps="curl \
                 nginx" && \
      apt-get install -y --no-install-recommends ${buildDeps} && \
      apt-get autoremove -y && \
      apt-get clean -y

RUN mkdir /app
WORKDIR /app

COPY --from=0  /app/xabber-websocket/_rel/xabber_ws/ ./xabber_ws/
RUN rm -rf /etc/nginx/sites-enabled/default
COPY ./docker/xabber.conf /etc/nginx/conf.d/

COPY . ./

COPY ./docker/entrypoint.sh /usr/local/bin/
ENTRYPOINT [ "/usr/local/bin/entrypoint.sh" ]

CMD [ "/usr/sbin/nginx", "-g", "daemon off;" ]
