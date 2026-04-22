import sys
import re

with open('index.html', 'r') as f:
    content = f.read()

new_css = """    <style>
        /* Global box-sizing so that padding and border are included in width/height */
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f5;
            margin: 0;
            padding: 2vmin;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: stretch;
        }

        #game-container {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: stretch;
            width: 100%;
            max-width: 180vh; /* Keep it constrained on huge wide monitors */
            gap: 2vmin;
        }

        /* --- Panel common --- */
        #button-board, #hole-board, #instruction-panel {
            background-color: #d2d2dc;
            padding: 2vmin;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 1vmin;
            display: flex;
            flex-direction: column;
        }

        /* Left Panel – Color Selection Panel */
        #button-board {
            width: 25%;
            gap: 2vmin;
        }

        #undo-button {
            font-size: 3vmin;
            padding: 2vmin;
            background-color: #d2d2dc;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 1vmin;
            color: #808080;
            cursor: pointer;
            transition: 0.2s;
        }

        #undo-button:disabled {
            background-color: #e0e0e0;
            color: #a0a0a0;
            cursor: not-allowed;
            border-color: #a0a0a0;
        }

        #undo-button:not(:disabled) {
            background-color: #ffffff;
            color: #000000;
        }

        /* Color buttons grid */
        #color-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: repeat(3, 1fr);
            gap: 1vmin;
        }

        .button-cell {
            background-color: #d2d2dc;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 1vmin;
            display: flex;
            justify-content: center;
            align-items: center;
            aspect-ratio: 1; /* perfect square */
            cursor: pointer;
            padding: 1vmin;
            transition: all 0.1s;
        }

        .button-cell:hover {
            border-color: rgb(51, 153, 255);
            border-width: max(2px, 0.4vmin);
            transform: scale(1.02);
        }

        .color-btn {
            width: 80%;
            aspect-ratio: 1;
            border-radius: 50%;
            border: max(1px, 0.2vmin) solid black;
            pointer-events: none;
            color: black;
            font-weight: bold;
            -webkit-text-stroke: max(1px, 0.15vmin) white;
            font-size: 4vmin;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .reset-button {
            font-size: 2.5vmin;
            padding: 1.5vmin;
            background-color: #d2d2dc;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 1vmin;
            color: #000;
            cursor: pointer;
            margin-top: auto; /* push to bottom */
            transition: 0.2s;
        }

        .reset-button:hover {
            background-color: #ffffff;
        }

        /* --- Game Board – Center Panel --- */
        #hole-board {
            width: 50%;
            gap: 1vmin;
        }

        .game-row {
            display: flex;
            align-items: center;
            justify-content: space-evenly;
            width: 100%;
            flex: 1; /* Allow rows to evenly distribute the container height */
            gap: 1%;
            min-height: 0;
        }

        .hole {
            width: 12%; /* Sizing relative to the width of the board */
            aspect-ratio: 1;
            border-radius: 50%;
            border: max(1px, 0.2vmin) solid black;
            background-color: #d2d2dc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: black;
            -webkit-text-stroke: max(1px, 0.15vmin) white;
            font-size: 3vmin;
        }

        .check-button {
            width: 15%;
            aspect-ratio: 3;
            font-size: 1.8vmin;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 0.5vmin;
            cursor: pointer;
            background: #eee;
            transition: 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .check-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .check-button:not(:disabled):hover {
            background: white;
        }

        .feedback-column {
            width: 12%;
            aspect-ratio: 1;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .feedback {
            width: 100%;
            height: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 5%;
            padding: 5%;
            border: max(1px, 0.15vmin) solid black;
            border-radius: 1vmin;
        }

        .peg {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: max(1px, 0.1vmin) solid black;
            background-color: #d2d2dc;
        }

        /* Answer row styles */
        #answer-row {
            margin-top: 1vmin;
            border-top: max(2px, 0.4vmin) solid black;
            padding-top: 1vmin;
            font-size: 2vmin;
        }

        .sequence-label, .mastermind-label {
            width: 15%;
            text-align: center;
            font-size: 2vmin;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* --- Right Panel – Instructions --- */
        #instruction-panel {
            width: 25%;
            font-size: 1.8vmin;
            line-height: 1.4;
            overflow-y: auto;
        }

        #instruction-panel h3 {
            margin-top: 0;
            font-size: 2.2vmin;
        }

        #scoreboard {
            margin-top: 2vmin;
            padding: 2vmin;
            border: max(1px, 0.2vmin) solid black;
            border-radius: 1vmin;
            background-color: #d2d2dc;
            text-align: center;
            font-weight: bold;
        }

        #scoreboard div {
            margin: 1vmin 0;
        }

        /* Toggle Container for Number Visibility */
        #toggle-container {
            margin-top: 3vmin;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1.5vmin;
            font-weight: bold;
        }

        /* iOS-style toggle switch */
        .switch {
            position: relative;
            display: inline-block;
            width: 6vmin;
            height: 3vmin;
        }

        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
            position: absolute; cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #ccc; transition: 0.4s;
            border-radius: 3vmin;
        }

        .slider:before {
            position: absolute; content: "";
            height: 2.2vmin; width: 2.2vmin;
            left: 0.4vmin; bottom: 0.4vmin;
            background-color: white; transition: 0.4s;
            border-radius: 50%;
        }

        input:checked + .slider { background-color: #2196F3; }
        input:checked + .slider:before { transform: translateX(3vmin); }

        /* When numbers are hidden, force the text (and its stroke) to be transparent */
        body.hide-numbers .color-btn,
        body.hide-numbers .hole {
            color: transparent !important;
            -webkit-text-stroke: 0px !important;
        }

        /* --- Responsive / Mobile adjustments --- */
        @media (max-aspect-ratio: 4/3) {
            #game-container {
                flex-direction: column;
                align-items: stretch;
                justify-content: flex-start;
                max-width: 100%;
            }

            #button-board, #hole-board, #instruction-panel {
                width: 100%;
            }

            #hole-board {
                order: -1; /* Board goes first on mobile */
            }

            #color-buttons {
                grid-template-columns: repeat(6, 1fr);
                grid-template-rows: 1fr;
            }

            .color-btn { font-size: 5vmin; }
            .hole { font-size: 4vmin; }
            #undo-button { font-size: 4vmin; }
            .reset-button { font-size: 4vmin; }
            
            .check-button { font-size: 2.5vmin; }
            
            #instruction-panel {
                font-size: 2.5vmin;
            }
            #instruction-panel h3 {
                font-size: 3vmin;
            }
            .sequence-label, .mastermind-label {
                font-size: 2.5vmin;
            }
        }
    </style>"""

content = re.sub(r'<style>.*?</style>', new_css, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
