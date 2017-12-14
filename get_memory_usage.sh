#!/bin/bash

if [[ "$OSTYPE" == "darwin"* ]]; then
    ps aux -m
else
    ps aux --sort -rss
fi