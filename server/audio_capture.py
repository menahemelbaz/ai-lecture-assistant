# Import modules for the program
import subprocess
import requests
import time
import io
import wave

# Set the server endpoint for streaming
SERVER_URL = "http://localhost:3000/stream"

# Set the audio format sent to the server
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  

# Define the audio chunks
BUFFER_DURATION_SECONDS = 5
CHUNK_SIZE = 4096

# Calculate the total buffer size in bytes
BUFFER_SIZE_BYTES = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * BUFFER_DURATION_SECONDS

# Build the ffmpeg command used to capture and output raw audio
FFMPEG_COMMAND = [
    "ffmpeg",
    "-f", "avfoundation",
    "-i", ":0",
    "-c:a", "pcm_s16le",
    "-ac", str(CHANNELS),
    "-ar", str(SAMPLE_RATE),
    "-f", "s16le", 
    "pipe:1"
]

# Create a WAV file from raw PCM data
def create_wav_file(pcm_data):

    wav_buffer = io.BytesIO()
    
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm_data)
    
    return wav_buffer.getvalue()

# Stream captured audio to the server
def stream_audio_to_server():

    try:
        process = subprocess.Popen(
            FFMPEG_COMMAND, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.DEVNULL
        )
    except FileNotFoundError:
        print("Error: ffmpeg is not installed or not found in PATH.")
        return

    # Check if the stdout pipe is available
    if process.stdout is None:
        print("Error: failed to open audio stream from ffmpeg.")
        return

    audio_buffer = bytearray()
    
    try:
        while True:
            # Read a chunk of PCM audio from ffmpeg output
            chunk = process.stdout.read(CHUNK_SIZE)

            # Stop if no audio data was received
            if not chunk:
                break
            
            # Add the audio chunk to the buffer
            audio_buffer.extend(chunk)
            
            # Check if the buffer reached the required size
            if len(audio_buffer) >= BUFFER_SIZE_BYTES:
        
                # Convert the buffered PCM audio into a WAV file
                wav_data = create_wav_file(bytes(audio_buffer))
                
                try:
                    # Send the WAV audio data to the server
                    response = requests.post(
                        SERVER_URL, 
                        data=wav_data,
                        headers={"Content-Type": "audio/wav"},
                        timeout=10
                    )
                    
                    # Check if the server responded successfully
                    if response.status_code == 200:

                        # Parse the JSON response and extract the text field
                        data = response.json()
                        text = data.get("text", "")

                        # Check if the received text is not empty
                        if text.strip():

                            # Print the transcribed text
                            print(f"{text}")

                    # Print an error message if the server returned a failure status    
                    else:
                        print(f"Server returned {response.status_code}: {response.text}")
                
                # Handle any errors that occur while sending the request
                except requests.exceptions.RequestException as e:
                    print(f"Error sending data: {e}")
                
                # Clear the audio buffer for the next chunk
                audio_buffer.clear()
    
    # Stop recording if the user interrupts the program
    except KeyboardInterrupt:
        print("\nRecording stopped by user.")
    
    # Terminate the ffmpeg process and wait for it to exit
    finally:
        process.terminate()
        process.wait()

# Run the audio streaming function when the script starts
if __name__ == "__main__":
    stream_audio_to_server()
    