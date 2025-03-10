// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import { http } from "follow-redirects";
import { IncomingMessage } from "http";
import { PassThrough } from "stream";
import * as yauzl from "yauzl";

import { bufferToStream, streamToBufferPromise } from "../stream/BufferUtils";

// import { HttpReadableStream } from "./HttpReadableStream";

const debug = debug_("r2:utils#zip/zip2RandomAccessReader_Http");

// import * as util from "util";
// export interface RandomAccessReader {
//     _readStreamForRange(start: number, end: number): void;
// }

// YAUZL:
// export abstract class RandomAccessReader extends EventEmitter {
//     _readStreamForRange(start: number, end: number): void;
//     createReadStream(options: { start: number; end: number }): void;
//     read(buffer: Buffer, offset: number, length: number, position: number, callback: (err?: Error) => void): void;
//     close(callback: (err?: Error) => void): void;
// }

export class HttpZipReader extends yauzl.RandomAccessReader {

    private firstBuffer: Buffer | undefined = undefined;
    private firstBufferStart: number = 0;
    private firstBufferEnd: number = 0;

    constructor(readonly url: string, readonly byteLength: number) {
        super();
        // yauzl.RandomAccessReader.call(this);
    }

    public _readStreamForRange(start: number, end: number) {
        // const length = end - start;
        // debug(`_readStreamForRange (new HttpReadableStream) ${this.url}` +
        //     ` content-length=${this.byteLength} start=${start} end+1=${end} (length=${length})`);

        // return new HttpReadableStream(this.url, this.byteLength, start, end);
        // =>

        // const length = end - start;
        // debug(`_read: ${size} (${this.url}` +
        //     ` content-length=${this.byteLength} start=${this.start} end+1=${this.end} (length=${length}))`);
        // debug(`alreadyRead: ${this.alreadyRead} (byteLength: ${length})`);

        if (this.firstBuffer && start >= this.firstBufferStart && end <= this.firstBufferEnd) {

            // debug(`HTTP CACHE ${this.url}: ${start}-${end} (${length}) [${this.byteLength}]`);

            const begin = start - this.firstBufferStart;
            const stop = end - this.firstBufferStart;

            return bufferToStream(this.firstBuffer.slice(begin, stop));
        }

        const stream = new PassThrough();

        const lastByteIndex = end - 1;
        const range = `${start}-${lastByteIndex}`;

        // debug(`HTTP GET ${this.url}: ${start}-${end} (${length}) [${this.byteLength}]`);

        const failure = (err: any) => {
            debug(err);
            // this.stream.end();
        };

        const success = async (res: IncomingMessage) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                failure("HTTP CODE " + res.statusCode);
                return;
            }

            // debug(res);

            // debug(res.headers);
            // debug(res.headers["content-type"]);
            // debug(`HTTP response content-range: ${res.headers["content-range"]}`);
            // debug(`HTTP response content-length: ${res.headers["content-length"]}`);

            if (this.firstBuffer) {
                res.pipe(stream);
                // // .on("end", () => {
                // //     debug("END");
                // // });
            } else {
                let buffer: Buffer;
                try {
                    buffer = await streamToBufferPromise(res);
                } catch (err) {
                    debug(err);
                    stream.end();
                    return;
                }
                debug(`streamToBufferPromise: ${buffer.length}`);

                this.firstBuffer = buffer;
                this.firstBufferStart = start;
                this.firstBufferEnd = end;

                stream.write(buffer);
                stream.end();
            }
        };

        http.get({
            ...new URL(this.url),
            headers: { Range: `bytes=${range}` },
        })
            .on("response", success)
            .on("error", failure);

        return stream;
    }
}
// util.inherits(HttpZipReader, yauzl.RandomAccessReader);

// // tslint:disable-next-line:space-before-function-paren
// HttpZipReader.prototype._readStreamForRange = function (start: number, end: number) {

// };
