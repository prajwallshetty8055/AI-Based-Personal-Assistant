from backend.app import app


if __name__ == "__main__":
    print("Sahayak AI is running at http://127.0.0.1:3000")
    app.run(host="127.0.0.1", port=3000, debug=False)
