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

## Links de compartilhamento

Arquivo pronto ganha links com validade e, se quiser, limite de downloads.

| Rota | O que faz |
| --- | --- |
| `POST /files/:id/links` | cria um link. Corpo opcional: `{ expiresInHours, maxDownloads }` (padrão 24h, sem limite) |
| `GET /files/:id/links` | lista os links do arquivo, com downloads e se ainda está ativo |
| `DELETE /files/:id/links/:linkId` | revoga o link na hora |
| `GET /s/:token` | o link público: conta o download e redireciona pro S3 |

Por que o link é um token próprio e não uma URL assinada do S3 direto:

- **Validade.** URL assinada dura no máximo 7 dias e, assinada com credencial temporária (o caso de uma Lambda), morre quando a sessão expira, às vezes em poucas horas.
- **Revogação e limite.** Uma URL assinada não tem como ser cancelada nem contar acessos. O token passa pela API, então dá.
- **Vazamento.** O redirect vai pra uma URL do S3 que vale 60 segundos (`DOWNLOAD_URL_TTL_SECONDS`). Se ela aparecer num log ou no histórico do navegador, já morreu.

Outros detalhes:

- No banco fica só o SHA-256 do token. Quem tiver acesso à tabela não consegue montar nenhum link.
- A checagem de validade e limite e o incremento do contador são uma única escrita condicional no DynamoDB. Com limite de 1 download e 20 requisições simultâneas, passa exatamente uma.
- O link nunca dura mais que o arquivo, que fica guardado por `FILE_RETENTION_DAYS` (padrão 30). O TTL do DynamoDB pode levar até dois dias pra apagar um item vencido, então a API confere a data em toda leitura e não depende dele.
- O download sai sempre como `attachment`, então o navegador baixa em vez de abrir o arquivo.

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
