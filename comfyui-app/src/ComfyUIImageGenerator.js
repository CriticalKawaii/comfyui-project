import React, { useState, useRef, useEffect } from "react";
import { Send, Download, Settings, Image, Loader2 } from 'lucide-react';

const ComfyUIImageGenerator = () => {
    const [prompt, setPrompt] = useState('');
    const [negativePrompt] = useState('(worst quality, low quality:1.4), (bad anatomy), text, error, missing fingers, extra digit, fewer digits, cropped, jpeg artifacts, signature, watermark, username, blurry, deformed face');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [error, setError] = useState('');
    const [comfyUIUrl] = useState(`http://${window.location.hostname}:8000`);
    const [settings, setSettings] = useState({
        width: 512,
        height: 512,
        steps: 20,
        cfg: 1,
        sampler: 'euler',
        scheduler: 'normal',
        seed: -1,
        model: 'FLUX1\\flux1-dev-fp8.safetensors',
        guidance: 3.6
    });
    const [showSettings, setShowSettings] = useState(false);
    const wsRef = useRef(null);
    const [clientId, setClientId] = useState('');

    useEffect(() => {
        setClientId(Math.random().toString(36).substring(2, 15));
    }, []);

    const createWorkflow = (prompt, negativePrompt, settings) => {
        return {
            "8": {
                "inputs": {
                    "samples": ["31", 0],
                    "vae": ["30", 2]
                },
                "class_type": "VAEDecode",
                "_meta": {
                    "title": "VAE Decode"
                }
            },
            "9": {
                "inputs": {
                    "filename_prefix": "ComfyUI",
                    "images": ["8", 0]
                },
                "class_type": "SaveImage",
                "_meta": {
                    "title": "Save Image"
                }
            },
            "27": {
                "inputs": {
                    "width": settings.width,
                    "height": settings.height,
                    "batch_size": 1
                },
                "class_type": "EmptySD3LatentImage",
                "_meta": {
                    "title": "EmptySD3LatentImage"
                }
            },
            "30": {
                "inputs": {
                    "ckpt_name": settings.model
                },
                "class_type": "CheckpointLoaderSimple",
                "_meta": {
                    "title": "Load Checkpoint"
                }
            },
            "31": {
                "inputs": {
                    "seed": settings.seed === -1 ? Math.floor(Math.random() * 1000000000000000) : settings.seed,
                    "steps": settings.steps,
                    "cfg": settings.cfg,
                    "sampler_name": settings.sampler,
                    "scheduler": settings.scheduler,
                    "denoise": 1,
                    "model": ["30", 0],
                    "positive": ["35", 0],
                    "negative": ["33", 0],
                    "latent_image": ["27", 0]
                },
                "class_type": "KSampler",
                "_meta": {
                    "title": "KSampler"
                }
            },
            "33": {
                "inputs": {
                    "text": negativePrompt,
                    "clip": ["30", 1]
                },
                "class_type": "CLIPTextEncode",
                "_meta": {
                    "title": "CLIP Text Encode (Negative Prompt)"
                }
            },
            "35": {
                "inputs": {
                    "guidance": settings.guidance,
                    "conditioning": ["38", 0]
                },
                "class_type": "FluxGuidance",
                "_meta": {
                    "title": "FluxGuidance"
                }
            },
            "38": {
                "inputs": {
                    "from_translate": "auto",
                    "to_translate": "en",
                    "manual_translate": false,
                    "Manual Trasnlate": "Manual Trasnlate",
                    "text": prompt,
                    "clip": ["30", 1]
                },
                "class_type": "GoogleTranslateCLIPTextEncodeNode",
                "_meta": {
                    "title": "Google Translate CLIP Text Encode Node"
                }
            }
        };
    };


    const connectWebSocket = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`${comfyUIUrl.replace('http', 'ws')}/ws?clientId=${clientId}`);

            ws.onopen = () => {
                wsRef.current = ws;
                resolve();
            };

            ws.onerror = (error) => {
                reject(new Error('Не удалось подключиться к ComfyUI WebSocket'));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'executed' && data.data.node === '9') {
                    const images = data.data.output.images;
                    if (images && images.length > 0) {
                        const imageUrl = `${comfyUIUrl}/view?filename=${images[0].filename}&subfolder=${images[0].subfolder}&type=${images[0].type}`;
                        setGeneratedImage(imageUrl);
                        setIsGenerating(false);
                    }
                }
            };
        });
    };

    const generateImage = async () => {
        if (!prompt.trim()) {
            setError('Введите промпт');
            return;
        }

        setIsGenerating(true);
        setError('');
        setGeneratedImage(null);

        try {
            await connectWebSocket();

            const workflow = createWorkflow(prompt, negativePrompt, settings);

            const response = await fetch(`${comfyUIUrl}/prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: workflow,
                    client_id: clientId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('ComfyUI Error Response:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            console.log('ComfyUI Response:', result);
        } catch (err) {
            setError(`Error: ${err.message}`);
            setIsGenerating(false);
        }
    };

    const downloadImage = () => {
        if (generatedImage) {
            const link = document.createElement('a');
            link.href = generatedImage;
            link.download = `comfyui-generated-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-600 to-indigo-900">
            {/* Бэкграунд */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -inset-10 opacity-50">
                    {[...Array(400)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white opacity-10 animate-pulse"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                width: `${Math.random() * 4 + 1}px`,
                                height: `${Math.random() * 4 + 1}px`,
                                animationDelay: `${Math.random() * 3}s`,
                                animationDuration: `${Math.random() * 3 + 2}s`
                            }}
                        />
                    ))}
                </div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8">
                {/* Лого */}
                <div className="text-center mb-12">
                    <div className="flex items-center justify-center mb-6">
                        <div className="p-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-2xl">
                            <svg width="192" height="41" viewBox="0 0 192 41" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M41.6814 0.0297053V37.9584C40.0378 36.8593 38.6862 35.4978 37.6267 33.869C36.3097 31.849 35.5919 29.527 35.478 26.8981V6.24306L23.2048 22.0859H16.2636L0 0L4.75779 0.0297053H8.55512L19.759 15.8725L31.7351 0.0297053H41.6814Z" fill="white"/>
                              <path d="M66.614 27.4675C65.4604 29.6112 63.6682 31.1856 61.2324 32.1906C58.7916 33.1956 55.9795 33.7006 52.7911 33.7006C50.0731 33.7006 47.6967 33.3145 45.6619 32.5471V38.503C47.8502 39.008 50.2266 39.2605 52.7911 39.2605C55.3557 39.2605 57.5539 39.0129 59.7719 38.5228C61.9849 38.0326 63.995 37.295 65.7872 36.3097C67.5844 35.3295 69.1191 34.0967 70.4064 32.6263C71.6936 31.1509 72.6639 29.4528 73.3323 27.5318L66.6189 27.4675H66.614ZM73.06 12.7931C72.3025 10.1146 71.0549 7.82734 69.3073 5.9262C67.5596 4.03001 65.3218 2.56455 62.5939 1.53972C59.8709 0.514891 56.6875 0 53.0585 0C50.4197 0 47.9591 0.292102 45.6668 0.871355V6.84211C47.8502 5.98561 50.3553 5.55984 53.1922 5.55984C55.0933 5.55984 56.9103 5.80738 58.6431 6.29752C60.3709 6.78765 61.876 7.49563 63.1632 8.40659C64.4504 9.3225 65.4753 10.4464 66.2526 11.788C67.0299 13.1248 67.4408 14.6447 67.4804 16.3428H45.6668V21.6997H73.664C74.0155 18.442 73.8175 15.4715 73.065 12.7931H73.06Z" fill="white"/>
                              <path d="M19.759 15.8725L15.6745 21.2838L0 0L8.55512 0.0297053L19.759 15.8725Z" fill="#DCD4F9"/>
                              <path d="M88.497 28.0369H90.8387V19.5461H87.1107L84.4521 25.7991L81.7687 19.5461H78.0358V28.0369H80.3627V21.5661L83.2738 28.0369H85.6007L88.497 21.576V28.0369Z" fill="white"/>
                              <path d="M94.8093 27.7051C95.6064 28.0765 96.5322 28.2646 97.5868 28.2646C98.6413 28.2646 99.5671 28.0765 100.364 27.7051C101.161 27.3338 101.78 26.809 102.221 26.1357C102.661 25.4624 102.884 24.6851 102.884 23.7989C102.884 22.9127 102.661 22.1206 102.221 21.4472C101.78 20.7739 101.161 20.2541 100.364 19.8778C99.5671 19.5065 98.6413 19.3184 97.5868 19.3184C96.5322 19.3184 95.6064 19.5065 94.8093 19.8778C94.0122 20.2491 93.3934 20.7739 92.9429 21.4472C92.4923 22.1206 92.2695 22.9028 92.2695 23.7989C92.2695 24.695 92.4923 25.4624 92.9429 26.1357C93.3884 26.809 94.0122 27.3289 94.8093 27.7051ZM95.146 22.4226C95.3688 22.0413 95.6906 21.7443 96.1065 21.5364C96.5223 21.3284 97.0174 21.2244 97.5818 21.2244C98.1462 21.2244 98.6562 21.3284 99.0671 21.5364C99.478 21.7443 99.7998 22.0413 100.023 22.4226C100.245 22.8038 100.359 23.2642 100.359 23.8039C100.359 24.3435 100.245 24.7891 100.023 25.1703C99.7998 25.5515 99.483 25.8486 99.0671 26.0565C98.6512 26.2644 98.1611 26.3684 97.5818 26.3684C97.0026 26.3684 96.5223 26.2644 96.1065 26.0565C95.6906 25.8486 95.3688 25.5515 95.146 25.1703C94.9232 24.7891 94.8093 24.3336 94.8093 23.8039C94.8093 23.2741 94.9232 22.8087 95.146 22.4226Z" fill="white"/>
                              <path d="M107.637 21.5266C108.028 21.3236 108.489 21.2196 109.018 21.2196C109.677 21.2196 110.236 21.378 110.697 21.6899C111.157 22.0018 111.454 22.4474 111.583 23.0267H114.073C113.974 22.289 113.692 21.6454 113.232 21.0958C112.771 20.5463 112.172 20.1106 111.449 19.7987C110.721 19.4868 109.914 19.3284 109.018 19.3284C108.003 19.3284 107.112 19.5165 106.34 19.8977C105.568 20.274 104.969 20.7988 104.533 21.4721C104.097 22.1454 103.884 22.9227 103.884 23.8089C103.884 24.6951 104.102 25.4625 104.533 26.1358C104.964 26.8141 105.568 27.3389 106.34 27.7102C107.112 28.0815 108.003 28.2697 109.018 28.2697C109.914 28.2697 110.726 28.1162 111.449 27.8092C112.177 27.5023 112.771 27.0666 113.232 26.5121C113.692 25.9576 113.974 25.314 114.073 24.5862H111.583C111.464 25.1209 111.172 25.5566 110.712 25.8833C110.251 26.2101 109.682 26.3784 109.018 26.3784C108.489 26.3784 108.028 26.2744 107.637 26.0715C107.246 25.8685 106.944 25.5764 106.736 25.1902C106.528 24.809 106.424 24.3486 106.424 23.8089C106.424 23.2693 106.528 22.7989 106.736 22.4128C106.944 22.0315 107.246 21.7345 107.637 21.5315V21.5266Z" fill="white"/>
                              <path d="M120.405 24.8386L122.356 28.0369H125.208L121.995 22.992L124.95 19.5461H122.237L117.91 24.8683V19.5461H115.415V28.0369H117.653L120.405 24.8386Z" fill="white"/>
                              <path d="M133.218 19.8828C132.421 19.5115 131.495 19.3234 130.441 19.3234C129.386 19.3234 128.46 19.5115 127.663 19.8828C126.866 20.2541 126.247 20.7789 125.797 21.4522C125.346 22.1256 125.124 22.9078 125.124 23.8039C125.124 24.7 125.346 25.4674 125.797 26.1407C126.242 26.814 126.866 27.3339 127.663 27.7102C128.46 28.0815 129.386 28.2696 130.441 28.2696C131.495 28.2696 132.421 28.0815 133.218 27.7102C134.015 27.3388 134.634 26.814 135.075 26.1407C135.515 25.4674 135.738 24.6901 135.738 23.8039C135.738 22.9177 135.515 22.1256 135.075 21.4522C134.634 20.7789 134.015 20.2591 133.218 19.8828ZM132.882 25.1654C132.659 25.5466 132.342 25.8437 131.926 26.0516C131.51 26.2595 131.02 26.3635 130.441 26.3635C129.862 26.3635 129.381 26.2595 128.965 26.0516C128.55 25.8437 128.228 25.5466 128.005 25.1654C127.782 24.7842 127.668 24.3287 127.668 23.799C127.668 23.2692 127.782 22.8038 128.005 22.4177C128.228 22.0364 128.55 21.7394 128.965 21.5315C129.381 21.3235 129.876 21.2196 130.441 21.2196C131.005 21.2196 131.515 21.3235 131.926 21.5315C132.337 21.7394 132.659 22.0364 132.882 22.4177C133.104 22.7989 133.218 23.2593 133.218 23.799C133.218 24.3386 133.104 24.7842 132.882 25.1654Z" fill="white"/>
                              <path d="M143.679 28.0369C144.605 28.0369 145.333 27.824 145.868 27.4032C146.397 26.9824 146.665 26.4031 146.665 25.6654C146.665 24.9773 146.402 24.4426 145.883 24.0613C145.576 23.8386 145.18 23.6801 144.709 23.5762C144.982 23.4722 145.224 23.3435 145.427 23.1801C145.902 22.7989 146.145 22.2988 146.145 21.68C146.145 21.0215 145.907 20.5017 145.427 20.1204C144.952 19.7392 144.303 19.5461 143.486 19.5461H136.951L137.426 23.7989L136.951 28.0369H143.679ZM143.858 26.1655C143.66 26.3387 143.343 26.4279 142.917 26.4279H139.481L139.729 24.4426H142.749C143.244 24.4426 143.605 24.5366 143.823 24.7198C144.041 24.903 144.15 25.1406 144.15 25.4278C144.15 25.7446 144.051 25.9922 143.853 26.1655H143.858ZM143.372 21.4275C143.546 21.5958 143.635 21.8136 143.635 22.0859C143.635 22.3731 143.536 22.6008 143.343 22.7741C143.15 22.9424 142.843 23.0266 142.427 23.0266H139.719L139.486 21.175H142.531C142.917 21.175 143.199 21.2591 143.372 21.4275Z" fill="white"/>
                              <path d="M156.967 26.5021C157.428 25.9476 157.71 25.304 157.809 24.5762H155.319C155.2 25.1109 154.908 25.5466 154.447 25.8734C153.987 26.2001 153.418 26.3685 152.754 26.3685C152.225 26.3685 151.764 26.2645 151.373 26.0615C150.982 25.8585 150.68 25.5664 150.472 25.1803C150.264 24.799 150.16 24.3386 150.16 23.799C150.16 23.2593 150.264 22.789 150.472 22.4028C150.68 22.0216 150.982 21.7245 151.373 21.5216C151.764 21.3186 152.225 21.2146 152.754 21.2146C153.413 21.2146 153.972 21.373 154.433 21.6849C154.893 21.9968 155.19 22.4424 155.319 23.0217H157.809C157.71 22.284 157.428 21.6404 156.967 21.0908C156.507 20.5413 155.908 20.1056 155.185 19.7937C154.457 19.4818 153.65 19.3234 152.754 19.3234C151.739 19.3234 150.848 19.5115 150.076 19.8927C149.304 20.269 148.704 20.7938 148.269 21.4671C147.833 22.1404 147.62 22.9177 147.62 23.8039C147.62 24.6901 147.838 25.4575 148.269 26.1308C148.7 26.8091 149.304 27.3339 150.076 27.7052C150.848 28.0765 151.739 28.2647 152.754 28.2647C153.65 28.2647 154.462 28.1112 155.185 27.8042C155.913 27.4973 156.507 27.0616 156.967 26.5071V26.5021Z" fill="white"/>
                              <path d="M164.141 24.8386L166.092 28.0369H168.944L165.731 22.992L168.691 19.5461H165.973L161.646 24.8683V19.5461H159.156V28.0369H161.394L164.141 24.8386Z" fill="white"/>
                              <path d="M179.954 28.0369V19.5461H176.746L172.241 25.7248V19.5461H169.795V28.0369H172.914L177.509 21.7443V28.0369H179.954Z" fill="white"/>
                              <path d="M184.519 18.0609C185.108 18.5361 185.881 18.7688 186.846 18.7688C187.812 18.7688 188.574 18.5312 189.168 18.0609C189.762 17.5905 190.119 16.8974 190.252 15.9963H188.312C188.232 16.4221 188.069 16.7489 187.822 16.9717C187.574 17.1944 187.247 17.3083 186.851 17.3083C186.455 17.3083 186.128 17.1944 185.876 16.9717C185.623 16.7489 185.46 16.4221 185.391 15.9963H183.435C183.574 16.9023 183.935 17.5905 184.524 18.0609H184.519Z" fill="white"/>
                              <path d="M188.787 19.5461L184.282 25.7248V19.5461H181.836V28.0369H184.955L189.549 21.7443V28.0369H192V19.5461H188.787Z" fill="white"/>
                              <path d="M83.2689 33.1066C82.7688 32.8491 82.1896 32.7253 81.5361 32.7253C80.9766 32.7253 80.4667 32.8244 80.0112 33.0125C79.5557 33.2056 79.1745 33.468 78.8725 33.8046C78.5705 34.1413 78.3725 34.5275 78.2734 34.9681H79.2587C79.3824 34.5324 79.6498 34.176 80.0607 33.9037C80.4716 33.6264 80.9618 33.4878 81.5361 33.4878C82.0113 33.4878 82.4322 33.5818 82.7886 33.765C83.1451 33.9532 83.4223 34.2156 83.6154 34.5572C83.759 34.8047 83.8432 35.0869 83.8828 35.3988H80.5607V36.1315H83.8828C83.8432 36.4385 83.7541 36.7207 83.6154 36.9633C83.4223 37.3049 83.1451 37.5673 82.7886 37.7554C82.4322 37.9436 82.0163 38.0327 81.5361 38.0327C80.9519 38.0327 80.4617 37.8941 80.0557 37.6218C79.6498 37.3495 79.3874 36.993 79.2587 36.5524H78.2734C78.3725 36.988 78.5705 37.3742 78.8725 37.7158C79.1745 38.0574 79.5557 38.3248 80.0112 38.5179C80.4667 38.711 80.9766 38.805 81.5361 38.805C82.1945 38.805 82.7738 38.6763 83.2689 38.4189C83.7689 38.1614 84.1551 37.8 84.4373 37.3445C84.7195 36.8841 84.8581 36.3543 84.8581 35.7553C84.8581 35.1562 84.7195 34.6265 84.4373 34.166C84.1551 33.7056 83.7689 33.3492 83.2689 33.0967V33.1066Z" fill="white"/>
                              <path d="M91.8932 32.8591H90.7793L87.0216 37.3743V32.8591H86.066V38.6863H86.9473L89.19 36.0425L90.9476 38.6863H92.0913L89.8089 35.3148L91.8932 32.8591Z" fill="white"/>
                              <path d="M94.3389 33.7898C94.6904 33.6016 95.0964 33.5125 95.5717 33.5125C96.1559 33.5125 96.6509 33.6512 97.0619 33.9334C97.4728 34.2156 97.7302 34.5918 97.8342 35.077H98.8194C98.7402 34.6067 98.5521 34.1958 98.255 33.8442C97.958 33.4927 97.5718 33.2204 97.1064 33.0224C96.641 32.8244 96.1311 32.7253 95.5717 32.7253C94.9181 32.7253 94.3438 32.8541 93.8487 33.1066C93.3487 33.364 92.9625 33.7205 92.6803 34.1759C92.3981 34.6314 92.2595 35.1661 92.2595 35.7652C92.2595 36.3642 92.3981 36.894 92.6803 37.3544C92.9625 37.8148 93.3487 38.1713 93.8487 38.4288C94.3488 38.6862 94.9231 38.8149 95.5717 38.8149C96.1311 38.8149 96.646 38.7159 97.1064 38.5129C97.5718 38.3149 97.953 38.0376 98.255 37.6861C98.557 37.3346 98.7452 36.9286 98.8194 36.4633H97.8342C97.7352 36.9336 97.4827 37.3099 97.0718 37.5921C96.6609 37.8743 96.1608 38.0178 95.5717 38.0178C95.1013 38.0178 94.6904 37.9287 94.3389 37.7455C93.9874 37.5623 93.7151 37.3 93.522 36.9633C93.3289 36.6266 93.2299 36.2256 93.2299 35.7652C93.2299 35.3047 93.3289 34.9037 93.522 34.5671C93.7151 34.2304 93.9874 33.973 94.3389 33.7848V33.7898Z" fill="white"/>
                              <path d="M99.9534 38.6863H100.909V33.6265H104.939V38.6863H105.894V32.8591H99.9534V38.6863Z" fill="white"/>
                              <path d="M112.375 33.1066C111.855 32.8491 111.251 32.7253 110.558 32.7253C109.865 32.7253 109.266 32.8541 108.746 33.1066C108.221 33.364 107.815 33.7155 107.528 34.171C107.236 34.6265 107.092 35.1562 107.092 35.7652C107.092 36.3741 107.236 36.8989 107.528 37.3594C107.82 37.8198 108.226 38.1812 108.746 38.4337C109.271 38.6911 109.875 38.8149 110.558 38.8149C111.241 38.8149 111.855 38.6862 112.375 38.4337C112.895 38.1763 113.301 37.8198 113.598 37.3594C113.89 36.8989 114.038 36.3642 114.038 35.7652C114.038 35.1661 113.89 34.6265 113.598 34.171C113.306 33.7155 112.895 33.3591 112.375 33.1066ZM112.756 36.9682C112.553 37.3049 112.261 37.5673 111.89 37.7505C111.518 37.9337 111.073 38.0228 110.558 38.0228C110.043 38.0228 109.612 37.9337 109.231 37.7505C108.855 37.5673 108.563 37.3049 108.365 36.9682C108.162 36.6316 108.063 36.2306 108.063 35.7701C108.063 35.3097 108.162 34.9186 108.365 34.5819C108.568 34.2453 108.855 33.9829 109.231 33.7947C109.607 33.6066 110.048 33.5175 110.558 33.5175C111.068 33.5175 111.514 33.6116 111.89 33.7947C112.266 33.9829 112.553 34.2453 112.756 34.5819C112.959 34.9186 113.063 35.3147 113.063 35.7701C113.063 36.2256 112.959 36.6316 112.756 36.9682Z" fill="white"/>
                              <path d="M120.593 33.1066C120.148 32.8491 119.643 32.7253 119.069 32.7253C118.529 32.7253 118.034 32.8541 117.588 33.1066C117.143 33.364 116.761 33.7155 116.445 34.171C116.351 34.3047 116.266 34.4482 116.192 34.5968V32.859H115.237V40.3943H116.192V36.9385C116.271 37.0871 116.355 37.2306 116.445 37.3643C116.761 37.8247 117.143 38.1812 117.588 38.4337C118.034 38.6911 118.529 38.8149 119.069 38.8149C119.643 38.8149 120.153 38.6862 120.593 38.4288C121.034 38.1713 121.386 37.8099 121.638 37.3544C121.891 36.894 122.019 36.3642 122.019 35.7652C122.019 35.1661 121.891 34.6265 121.638 34.171C121.386 33.7155 121.039 33.3591 120.593 33.1066ZM120.767 36.9385C120.584 37.2752 120.331 37.5425 120.009 37.7307C119.687 37.9188 119.321 38.0129 118.915 38.0129C118.509 38.0129 118.118 37.9188 117.766 37.7307C117.415 37.5425 117.108 37.2752 116.836 36.9385C116.568 36.6019 116.341 36.2108 116.162 35.7701C116.341 35.3295 116.568 34.9384 116.836 34.6017C117.108 34.2651 117.415 33.9977 117.766 33.8096C118.118 33.6215 118.499 33.5224 118.915 33.5224C119.331 33.5224 119.687 33.6165 120.009 33.8096C120.331 33.9977 120.584 34.2651 120.767 34.6017C120.95 34.9384 121.044 35.3295 121.044 35.7701C121.044 36.2108 120.95 36.6019 120.767 36.9385Z" fill="white"/>
                              <path d="M122.307 33.6364H124.841V38.6863H125.797V33.6364H128.332V32.8591H122.307V33.6364Z" fill="white"/>
                              <path d="M134.263 35.3544H130.178V32.8591H129.238V38.6863H130.178V36.1267H134.263V38.6863H135.218V32.8591H134.263V35.3544Z" fill="white"/>
                              <path d="M144.11 32.8591H143.155V38.6863H144.11V32.8591Z" fill="white"/>
                              <path d="M141.333 35.0821C140.996 34.9236 140.605 34.8444 140.154 34.8444H137.723V32.8591H136.768V38.6863H140.154C140.605 38.6863 140.996 38.6071 141.333 38.4487C141.669 38.2902 141.932 38.0675 142.115 37.7754C142.303 37.4882 142.397 37.1466 142.397 36.7604C142.397 36.3743 142.303 36.0475 142.115 35.7554C141.927 35.4633 141.664 35.2405 141.333 35.0821ZM141.055 37.612C140.813 37.8249 140.486 37.9288 140.07 37.9288H137.723V35.5772H140.07C140.486 35.5772 140.813 35.6811 141.055 35.894C141.298 36.102 141.417 36.3941 141.417 36.7604C141.417 37.1268 141.298 37.404 141.055 37.612Z" fill="white"/>
                              <path d="M148.744 32.2155C149.314 32.2155 149.774 32.067 150.126 31.7749C150.477 31.4828 150.69 31.0619 150.759 30.5173H149.947C149.883 30.854 149.749 31.1164 149.541 31.2996C149.333 31.4828 149.066 31.5719 148.739 31.5719C148.413 31.5719 148.155 31.4828 147.942 31.2996C147.729 31.1164 147.596 30.854 147.531 30.5173H146.719C146.794 31.0619 147.007 31.4828 147.358 31.7749C147.71 32.067 148.165 32.2155 148.734 32.2155H148.744Z" fill="white"/>
                              <path d="M146.605 37.7654V32.8591H145.66V38.6863H146.873L151.007 33.7503V38.6863H151.952V32.8591H150.715L146.605 37.7654Z" fill="white"/>
                              <path d="M162.235 32.8591H161.28V37.909H157.334V32.8591H156.378V38.6863H162.488V40.1963H163.329V37.909H162.235V32.8591Z" fill="white"/>
                              <path d="M169.825 34.3047C169.567 33.8046 169.201 33.4185 168.731 33.1412C168.26 32.864 167.711 32.7253 167.077 32.7253C166.443 32.7253 165.874 32.8541 165.384 33.1066C164.894 33.364 164.508 33.7155 164.23 34.171C163.953 34.6265 163.815 35.1562 163.815 35.7652C163.815 36.3741 163.963 36.894 164.255 37.3544C164.547 37.8148 164.953 38.1713 165.468 38.4288C165.983 38.6862 166.577 38.8149 167.25 38.8149C167.751 38.8149 168.246 38.7308 168.746 38.5624C169.246 38.3941 169.671 38.1664 170.033 37.8743V37.1316C169.667 37.4089 169.251 37.6267 168.79 37.7851C168.33 37.9436 167.859 38.0228 167.384 38.0228C166.859 38.0228 166.399 37.9287 166.013 37.7455C165.627 37.5623 165.325 37.295 165.112 36.9484C164.948 36.686 164.849 36.384 164.81 36.0474H170.211C170.211 35.384 170.082 34.8047 169.82 34.3047H169.825ZM165.874 33.7848C166.216 33.6016 166.612 33.5125 167.067 33.5125C167.488 33.5125 167.859 33.5967 168.181 33.77C168.498 33.9433 168.751 34.1859 168.939 34.5027C169.072 34.7354 169.166 34.9978 169.211 35.2899H164.829C164.874 35.0225 164.953 34.775 165.077 34.5572C165.265 34.2255 165.533 33.968 165.874 33.7848Z" fill="white"/>
                              <path d="M176.425 35.3544H172.345V32.8591H171.399V38.6863H172.345V36.1267H176.425V38.6863H177.385V32.8591H176.425V35.3544Z" fill="white"/>
                              <path d="M178.286 33.6364H180.821V38.6863H181.776V33.6364H184.311V32.8591H178.286V33.6364Z" fill="white"/>
                              <path d="M190.574 33.1066C190.129 32.8491 189.624 32.7253 189.049 32.7253C188.51 32.7253 188.015 32.8541 187.569 33.1066C187.123 33.364 186.742 33.7155 186.425 34.171C186.331 34.3047 186.247 34.4482 186.173 34.5918V32.8541H185.217V40.3893H186.173V36.9336C186.252 37.0821 186.336 37.2257 186.425 37.3594C186.742 37.8198 187.123 38.1763 187.569 38.4288C188.015 38.6862 188.51 38.81 189.049 38.81C189.624 38.81 190.134 38.6812 190.574 38.4238C191.015 38.1664 191.366 37.8049 191.619 37.3495C191.871 36.889 192 36.3593 192 35.7602C192 35.1612 191.871 34.6215 191.619 34.166C191.366 33.7106 191.02 33.3541 190.574 33.1016V33.1066ZM190.747 36.9385C190.564 37.2752 190.312 37.5425 189.99 37.7307C189.668 37.9188 189.302 38.0129 188.896 38.0129C188.49 38.0129 188.099 37.9188 187.747 37.7307C187.396 37.5425 187.089 37.2752 186.816 36.9385C186.549 36.6019 186.321 36.2108 186.143 35.7701C186.321 35.3295 186.549 34.9384 186.816 34.6017C187.089 34.2651 187.396 33.9977 187.747 33.8096C188.099 33.6215 188.48 33.5224 188.896 33.5224C189.312 33.5224 189.668 33.6165 189.99 33.8096C190.312 33.9977 190.564 34.2651 190.747 34.6017C190.931 34.9384 191.025 35.3295 191.025 35.7701C191.025 36.2108 190.931 36.6019 190.747 36.9385Z" fill="white"/>
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Панель ввода */}
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
                        <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                            <Image className="w-6 h-6 mr-2" />
                            Создайте свое изображение
                        </h2>

                        {/* Промпт */}
                        <div className="mb-6">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none h-24"
                                placeholder="Опишите изображение... "
                            />
                        </div>

                        {/* Переключатель настроек */}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center text-purple-300 hover:text-white transition-colors mb-4"
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Продвинутые настройки 
                        </button>

                        {/* Продвинутые настройки */}
                        {showSettings && (
                            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Guidance</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="1"
                                            max="10"
                                            value={settings.guidance}
                                            onChange={(e) => setSettings({...settings, guidance: e.target.value <= 10 ? parseFloat(e.target.value) : 10})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Sampler</label>
                                        <select
                                            value={settings.sampler}
                                            onChange={(e) => setSettings({...settings, sampler: e.target.value})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        >
                                            <option value="euler">Euler</option>
                                            <option value="euler_ancestral">Euler Ancestral</option>
                                            <option value="dpmpp_2m">DPM++ 2M</option>
                                            <option value="ddim">DDIM</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Scheduler</label>
                                        <select
                                            value={settings.scheduler}
                                            onChange={(e) => setSettings({...settings, scheduler: e.target.value})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        >
                                            <option value="simple">Simple</option>
                                            <option value="normal">Normal</option>
                                            <option value="karras">Karras</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Ширина</label>
                                        <input
                                            type="number"
                                            value={settings.width}
                                            max="1024"
                                            onChange={(e) => setSettings({...settings, width: e.target.value <= 1024 ? parseInt(e.target.value) : 1024})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Высота</label>
                                        <input
                                            type="number"
                                            value={settings.height}
                                            max="1024"
                                            onChange={(e) => setSettings({...settings, height: e.target.value <= 1024 ? parseInt(e.target.value) : 1024})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-purple-200 mb-1">Steps</label>
                                        <input
                                            type="number"
                                            value={settings.steps}
                                            max="30"
                                            onChange={(e) => setSettings({...settings, steps: e.target.value <= 30 ? parseInt(e.target.value): 30})}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Кнопка генерации */}
                        <button
                            onClick={generateImage}
                            disabled={isGenerating}
                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Генерируется...</span>
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    <span>Сгенерировать изображение</span>
                                </>
                            )}
                        </button>

                        {/* Сообщение об ошибке */}
                        {error && (
                            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                                <p className="text-red-200 text-sm">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* Панель результата */}
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
                        <h2 className="text-2xl font-bold text-white mb-6">Сгенерированное изображение</h2>
                        
                        <div className="aspect-square bg-white/5 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center relative overflow-hidden">
                            {isGenerating ? (
                                <div className="text-center">
                                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                                    <p className="text-purple-200">Создаем ваше изображение...</p>
                                </div>
                            ) : generatedImage ? (
                                <div className="relative w-full h-full">
                                    <img
                                        src={generatedImage}
                                        alt="Generated"
                                        className="w-full h-full object-contain rounded-lg"
                                    />
                                    <button
                                        onClick={downloadImage}
                                        className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-all"
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <Image className="w-16 h-16 text-white/30 mx-auto mb-4" />
                                    <p className="text-white/50">Ваше изображение появится здесь</p>
                                </div>
                            )}
                        </div>

                        {generatedImage && (
                            <div className="mt-6 text-center">
                                <button
                                    onClick={downloadImage}
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 mx-auto shadow-lg hover:shadow-xl transform hover:scale-105"
                                >
                                    <Download className="w-5 h-5" />
                                    <span>Скачать изображение</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComfyUIImageGenerator;