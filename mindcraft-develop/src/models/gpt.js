import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class GPT {

    static prefix = 'openai';

    constructor(model_name, url, params) {

        this.model_name = model_name?.replace(/^gpt\//, '') || 'gpt-oss:20b-cloud';

        /*
         * ========================================================
         * OLLAMA CLOUD
         * ========================================================
         *
         * GPT-OSS runs through Ollama's OpenAI-compatible API.
         *
         * Default:
         *
         *   https://ollama.com/v1
         *
         * You can still override the endpoint from the profile.
         */

        this.url =
            url ||
            'https://ollama.com/v1';

        this.params =
            params || {};

        let config = {};

        config.baseURL =
            this.url;

        /*
         * Ollama Cloud API key.
         *
         * Keep this separate from the real OpenAI API key.
         */

        config.apiKey =
            getKey('OLLAMA_API_KEY');

        this.openai =
            new OpenAIApi(config);
    }


    /*
     * ========================================================
     * CHAT
     * ========================================================
     */

    async sendRequest(
        turns,
        systemMessage,
        stop_seq = '***'
    ) {

        let messages =
            strictFormat(turns);

        messages =
            messages.map(message => ({
                ...message,
                content:
                    message.content + stop_seq
            }));


        const model =
            this.model_name ||
            'gpt-oss:20b';


        try {

            console.log(
                '[GPT/Ollama Cloud] Awaiting response from model',
                model
            );


            const allMessages = [

                {
                    role: 'system',
                    content: systemMessage
                },

                ...turns

            ];


            const formattedMessages =
                strictFormat(allMessages);


            const pack = {

                model,

                messages:
                    formattedMessages,

                stop:
                    stop_seq,

                ...this.params

            };


            /*
             * Some reasoning models do not accept stop.
             */

            if (
                model.includes('o1') ||
                model.includes('o3') ||
                model.includes('5')
            ) {
                delete pack.stop;
            }


            const completion =
                await this.openai.chat.completions.create(
                    pack
                );


            if (
                completion?.choices?.[0]?.finish_reason ===
                'length'
            ) {

                throw new Error(
                    'Context length exceeded'
                );

            }


            console.log(
                '[GPT/Ollama Cloud] Received.'
            );


            return (
                completion?.choices?.[0]?.message?.content ??
                ''
            );

        }

        catch (err) {

            /*
             * ==================================================
             * CONTEXT RECOVERY
             * ==================================================
             */

            if (
                (
                    err.message ===
                    'Context length exceeded' ||

                    err.code ===
                    'context_length_exceeded'
                ) &&

                turns.length > 1

            ) {

                console.log(
                    '[GPT/Ollama Cloud] Context too large. Retrying with shorter context.'
                );


                return this.sendRequest(

                    turns.slice(1),

                    systemMessage,

                    stop_seq

                );

            }


            /*
             * ==================================================
             * VISION ERROR
             * ==================================================
             */

            if (
                err.message &&
                err.message.includes('image_url')
            ) {

                console.log(err);

                return (
                    'Vision is only supported by compatible models.'
                );

            }


            /*
             * ==================================================
             * NORMAL ERROR
             * ==================================================
             */

            console.error(
                '[GPT/Ollama Cloud] Request failed:',
                err
            );


            return (
                'My brain disconnected, try again.'
            );
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

            role: 'user',

            content: [

                {
                    type: 'input_text',
                    text: systemMessage
                },

                {
                    type: 'input_image',

                    image_url:
                        `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                }

            ]

        });


        return this.sendRequest(

            imageMessages,

            systemMessage

        );
    }


    /*
     * ========================================================
     * EMBEDDINGS
     * ========================================================
     */

    async embed(text) {

        if (text.length > 8191) {

            text =
                text.slice(0, 8191);

        }


        const embedding =
            await this.openai.embeddings.create({

                model:
                    this.model_name,

                input:
                    text,

                encoding_format:
                    'float'

            });


        return (
            embedding.data[0].embedding
        );
    }
}


/*
 * ============================================================
 * OPENAI TTS
 * ============================================================
 *
 * IMPORTANT:
 *
 * This is REAL OpenAI.
 *
 * GPT-OSS:
 *     Ollama Cloud
 *
 * TTS:
 *     OpenAI API
 *
 * They are completely separate.
 * ============================================================
 */

const sendAudioRequest =
    async (
        text,
        model,
        voice,
        url
    ) => {

        const payload = {

            model:
                model ||
                'gpt-4o-mini-tts',

            voice:
                voice ||
                'alloy',

            input:
                text

        };


        let config = {};


        config.baseURL =
            url ||
            'https://api.openai.com/v1';


        /*
         * THIS is the real OpenAI key.
         */

        config.apiKey =
            getKey('OPENAI_API_KEY');


        const openai =
            new OpenAIApi(config);


        const mp3 =
            await openai.audio.speech.create(
                payload
            );


        const buffer =
            Buffer.from(
                await mp3.arrayBuffer()
            );


        return buffer.toString('base64');
    };


export const TTSConfig = {

    sendAudioRequest,

    baseUrl:
        'https://api.openai.com/v1'

};