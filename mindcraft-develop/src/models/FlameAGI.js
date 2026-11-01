import { strictFormat } from '../utils/text.js';

import FlameBrain from '../agent/flameagi/brain.js';

import path from 'path';
import { fileURLToPath } from 'url';


const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


/*
 * ============================================================
 * FlameAGI Model Provider
 * ============================================================
 *
 * MindCraft sees FlameAGI as a model/provider.
 *
 * Architecture:
 *
 *     MindCraft
 *         ↓
 *     FlameAGI
 *         ↓
 *     FlameBrain
 *         ↓
 *     Ollama
 *         ↓
 *     Gemma
 *
 *
 * IMPORTANT:
 *
 * FlameAGI = provider interface
 * FlameBrain = Flame's cognitive layer
 * Ollama = inference engine
 * Gemma = language model
 *
 *
 * Personality is OWNED by FlameBrain.
 *
 * FlameAGI must NOT load personality.json.
 *
 * ============================================================
 */


/*
 * ============================================================
 * FLAMEAGI
 * ============================================================
 */

export class FlameAGI {

    static prefix = 'FlameAGI';


    constructor(
        model_name,
        url,
        params
    ) {

        /*
         * ====================================================
         * MODEL NAME
         * ====================================================
         *
         * Examples:
         *
         * FlameAGI/gemma2:2b
         *          ↓
         * gemma2:2b
         *
         * FlameAGI:gemma2:2b
         *          ↓
         * gemma2:2b
         *
         * ====================================================
         */

        this.model_name =
            typeof model_name === 'string'
                ? model_name.replace(
                    /^FlameAGI[/:]+/i,
                    ''
                )
                : model_name;


        /*
         * ====================================================
         * OLLAMA URL
         * ====================================================
         */

        this.url =
            url ||
            'http://127.0.0.1:11434';


        /*
         * ====================================================
         * PARAMETERS
         * ====================================================
         */

        this.params =
            params || {};


        /*
         * ====================================================
         * OLLAMA
         * ====================================================
         */

        this.ollama =
            new Ollama(
                this.model_name,
                this.url,
                this.params
            );


        /*
         * ====================================================
         * FLAME BRAIN
         * ====================================================
         *
         * Brain owns:
         *
         * - personality
         * - memory
         * - experiences
         * - reflection
         * - learning
         * - rewards
         *
         * FlameAGI itself remains the provider wrapper.
         *
         * ====================================================
         */

        this.brain =
            new FlameBrain({

                model:
                    this.ollama,

                agent:
                    params?.agent ?? null

            });
    }


    /*
     * ========================================================
     * CHAT
     * ========================================================
     */

    async sendRequest(
        turns = [],
        systemMessage = ''
    ) {

        /*
         * Do NOT load personality here.
         *
         * FlameBrain handles personality injection.
         *
         * This is extremely important because otherwise
         * personality.json would be injected twice.
         */

        const result =
            await this.brain.process({

                turns,

                systemMessage,

                context: {

                    source:
                        'MindCraft',

                    model:
                        this.model_name,

                    provider:
                        'FlameAGI'

                }

            });


        return result.response;
    }


    /*
     * ========================================================
     * EMBEDDINGS
     * ========================================================
     */

    async embed(text) {

        return await this.ollama.embed(
            text
        );
    }


    /*
     * ========================================================
     * VISION
     * ========================================================
     *
     * Vision currently remains a direct Ollama operation.
     *
     * ========================================================
     */

    async sendVisionRequest(
        messages,
        systemMessage,
        imageBuffer
    ) {

        return await this.ollama.sendVisionRequest(

            messages,

            systemMessage,

            imageBuffer

        );
    }
}


/*
 * ============================================================
 * OLLAMA ENGINE
 * ============================================================
 */

class Ollama {

    constructor(
        model_name,
        url,
        params
    ) {

        this.model_name =
            model_name;

        this.params =
            params || {};

        this.url =
            url ||
            'http://127.0.0.1:11434';

        this.chat_endpoint =
            '/api/chat';

        this.embedding_endpoint =
            '/api/embeddings';
    }


    /*
     * ========================================================
     * CHAT REQUEST
     * ========================================================
     */

    async sendRequest(
        turns = [],
        systemMessage = ''
    ) {

        const model =
            this.model_name ||
            'gemma2:2b';


        /*
         * ====================================================
         * FORMAT MINDCRAFT MESSAGES
         * ====================================================
         */

        let messages =
            strictFormat(
                turns
            );


        /*
         * ====================================================
         * SYSTEM MESSAGE
         * ====================================================
         *
         * Brain has already constructed the complete system
         * message.
         *
         * Therefore Ollama simply forwards it.
         *
         * ====================================================
         */

        if (
            typeof systemMessage === 'string' &&
            systemMessage.trim() !== ''
        ) {

            messages.unshift({

                role:
                    'system',

                content:
                    systemMessage

            });
        }


        /*
         * ====================================================
         * RETRY SYSTEM
         * ====================================================
         */

        const maxAttempts = 5;

        let attempt = 0;

        let finalRes = null;


        while (
            attempt < maxAttempts
        ) {

            attempt++;


            console.log(

                `[FlameAGI/Ollama] ` +
                `Awaiting response... ` +
                `(model: ${model}, attempt: ${attempt})`

            );


            try {

                const apiResponse =
                    await this.send(

                        this.chat_endpoint,

                        {

                            model,

                            messages,

                            stream:
                                false,

                            ...this.params

                        }

                    );


                /*
                 * ==========================================
                 * NORMAL OLLAMA RESPONSE
                 * ==========================================
                 */

                if (

                    apiResponse &&

                    apiResponse.message &&

                    typeof apiResponse.message.content ===
                        'string'

                ) {

                    let response =
                        apiResponse
                            .message
                            .content;


                    /*
                     * ======================================
                     * THINKING BLOCK HANDLING
                     * ======================================
                     */

                    const hasOpenTag =
                        response.includes(
                            '<think>'
                        );


                    const hasCloseTag =
                        response.includes(
                            '</think>'
                        );


                    /*
                     * Incomplete thinking block.
                     */

                    if (

                        hasOpenTag &&

                        !hasCloseTag

                    ) {

                        console.warn(

                            '[FlameAGI/Ollama] ' +
                            'Partial <think> block detected.'

                        );


                        if (

                            attempt <
                            maxAttempts

                        ) {

                            continue;
                        }
                    }


                    /*
                     * Orphan closing tag.
                     */

                    if (

                        hasCloseTag &&

                        !hasOpenTag

                    ) {

                        response =
                            '<think>' +
                            response;
                    }


                    /*
                     * Remove complete thinking blocks.
                     */

                    if (

                        hasOpenTag &&

                        hasCloseTag

                    ) {

                        response =
                            response

                                .replace(
                                    /<think>[\s\S]*?<\/think>/gi,
                                    ''
                                )

                                .trim();
                    }


                    finalRes =
                        response;

                    break;
                }


                /*
                 * ==========================================
                 * INVALID RESPONSE
                 * ==========================================
                 */

                console.warn(

                    '[FlameAGI/Ollama] ' +
                    'Invalid response from Ollama:',

                    apiResponse

                );


                finalRes =
                    'No response data from Ollama.';

                break;

            }


            catch (error) {

                /*
                 * ==========================================
                 * CONTEXT LENGTH RECOVERY
                 * ==========================================
                 */

                if (

                    error?.message
                        ?.toLowerCase()
                        .includes(
                            'context length'
                        ) &&

                    turns.length > 1

                ) {

                    console.log(

                        '[FlameAGI/Ollama] ' +
                        'Context length exceeded. ' +
                        'Retrying with shorter context.'

                    );


                    return this.sendRequest(

                        turns.slice(1),

                        systemMessage

                    );
                }


                /*
                 * ==========================================
                 * REAL ERROR
                 * ==========================================
                 */

                console.error(

                    '[FlameAGI/Ollama] Request failed:',

                    error.message

                );


                /*
                 * ==========================================
                 * RETRY
                 * ==========================================
                 */

                if (

                    attempt <
                    maxAttempts

                ) {

                    continue;
                }


                finalRes =
                    'My brain disconnected. Try again.';
            }
        }


        /*
         * ====================================================
         * FINAL FALLBACK
         * ====================================================
         */

        if (

            finalRes === null

        ) {

            finalRes =
                'I thought too hard. Sorry, try again.';
        }


        return finalRes;
    }


    /*
     * ========================================================
     * EMBEDDINGS
     * ========================================================
     */

    async embed(text) {

        const model =
            this.model_name ||
            'embeddinggemma';


        const response =
            await this.send(

                this.embedding_endpoint,

                {

                    model,

                    input:
                        text

                }

            );


        if (

            !response ||

            !response.embedding

        ) {

            throw new Error(

                'Ollama did not return an embedding.'

            );
        }


        return response.embedding;
    }


    /*
     * ========================================================
     * HTTP REQUEST
     * ========================================================
     */

    async send(
        endpoint,
        body
    ) {

        const url =
            new URL(
                endpoint,
                this.url
            );


        try {

            const response =
                await fetch(

                    url,

                    {

                        method:
                            'POST',

                        headers: {

                            'Content-Type':
                                'application/json'

                        },

                        body:
                            JSON.stringify(
                                body
                            )

                    }

                );


            /*
             * Preserve actual Ollama errors.
             */

            if (

                !response.ok

            ) {

                const errorText =
                    await response.text();


                throw new Error(

                    `Ollama HTTP ${response.status}: ${errorText}`

                );
            }


            return await response.json();

        }


        catch (error) {

            console.error(

                '[FlameAGI/Ollama] ' +
                `Request failed: ${url}`

            );


            throw error;
        }
    }


    /*
     * ========================================================
     * VISION
     * ========================================================
     */

    async sendVisionRequest(
        messages,
        systemMessage,
        imageBuffer
    ) {

        const imageMessages =
            [...messages];


        imageMessages.push({

            role:
                'user',

            content: [

                {

                    type:
                        'text',

                    text:
                        systemMessage

                },

                {

                    type:
                        'image_url',

                    image_url: {

                        url:
                            `data:image/jpeg;base64,` +
                            imageBuffer.toString(
                                'base64'
                            )

                    }

                }

            ]

        });


        return this.sendRequest(

            imageMessages,

            systemMessage

        );
    }
}


export default FlameAGI;