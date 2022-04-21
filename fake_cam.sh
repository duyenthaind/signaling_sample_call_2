#/bin/env sh

Simulate camera from source $1

#ffmpeg -stream_loop -1 -re -i /home/duyenthai/Downloads/ganyu.mp4 -vcodec rawvideo -threads 0 -f v4l2 /dev/video0

ffmpeg -stream_loop -1 -re -i $1 -vcodec rawvideo -threads 0 -f v4l2 /dev/video0
