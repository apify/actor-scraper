> You have definitely noticed that we changed up the code a little bit. This is because the back and forth communication
between Node.js and browser takes some time and it slows down the scraper. To limit the effect of this, we changed
all the functions to start at the same time and only wait for all of them to finish at the end. This is called
concurrency or parallelism. Unless the functions need to be executed in a specific order, it's often a good idea
to run them concurrently to speed things up.
