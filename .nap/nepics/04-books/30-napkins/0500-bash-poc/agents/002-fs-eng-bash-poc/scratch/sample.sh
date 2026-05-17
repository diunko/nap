cat <<EOF
 _               _
| |__   __ _ ___| |__        _ __   ___   ___
| '_ \ / _' / __| '_ \ ____| '_ \ / _ \ / __|
| |_) | (_| \__ \ | | |____| |_) | (_) | (__
|_.__/ \__,_|___/_| |_|    | .__/ \___/ \___|
                            |_|
EOF
echo -e "\033[31mred\033[0m \033[32mgreen\033[0m \033[33myellow\033[0m \033[34mblue\033[0m \033[35mmagenta\033[0m \033[36mcyan\033[0m"
git clone https://github.com/abs0luty/rightpad
cd rightpad
ls
cat README.md
git log --oneline
echo "hello" >> README.md
git status
git add .
git commit -m "test commit"
git log --oneline
