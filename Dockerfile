FROM btwiuse/arch:bun

ADD . /app

WORKDIR /app

RUN bun upgrade

RUN bun i

RUN bun run build

CMD bun start
