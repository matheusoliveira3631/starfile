# Starfile

Compartilhamento de arquivos com links temporários. Os arquivos vão direto do navegador pro S3, a API roda em Lambda e os metadados ficam no DynamoDB.

> Reescrita em andamento. A versão antiga, em Flask, está na tag [`v1-flask`](https://github.com/matheusoliveira3631/starfile/tree/v1-flask).

## Como funciona o upload

O arquivo nunca passa pela API. O cliente pede uma URL, manda o arquivo direto pro S3 e uma Lambda confere o conteúdo depois.

1. `POST /uploads` com `{ filename, contentType, size }`. A API checa tamanho, tipo e extensão, grava o registro como `pending` e devolve um formulário de presigned POST.
2. O cliente envia o arquivo para o S3 com esse formulário. A policy amarra key, `Content-Type` e tamanho exato (`content-length-range`), então o S3 recusa qualquer coisa diferente do que foi declarado.
3. O evento do S3 dispara a Lambda de validação, que lê os primeiros bytes e compara a assinatura real do arquivo com o tipo declarado. Se bater, o arquivo vai de `pending/` para `files/` e o registro vira `ready`. Se não, o arquivo é apagado e o registro vira `rejected`.
4. `GET /files/:id` mostra o status.

Tipos aceitos: PNG, JPEG, GIF, WebP, PDF, ZIP e texto (UTF-8). Limite padrão de 25 MB (`MAX_UPLOAD_MB`).

## Rodando localmente

Precisa de Node 22.

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3000/health
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor local com reload |
| `npm test` | testes (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | checagem de tipos |
| `npm run build` | compila para `dist/` |
